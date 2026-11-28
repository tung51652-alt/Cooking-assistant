"""Fine-tune a separate EfficientNet-B2 candidate with the audited pilot data."""

import argparse
import json
from collections import defaultdict
from contextlib import ExitStack
from pathlib import Path
from zipfile import ZipFile

import torch
from PIL import Image, ImageOps
from torch import nn
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms
from torchvision.models import EfficientNet_B2_Weights, efficientnet_b2

from .pilot_data import FALLBACK_ORDER, RELEASE_MANIFEST, ROOT, file_under, sample_epoch

BASE_CHECKPOINT = ROOT / "deploy/artifacts/staging/vision/efficientnet_b2_best.pt"
WEIGHTS = EfficientNet_B2_Weights.IMAGENET1K_V1


class PilotImages(Dataset):
    def __init__(self, rows, archive, fallback, transform):
        self.rows, self.archive, self.fallback, self.transform = rows, archive, fallback, transform

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, index):
        row = self.rows[index]
        if row["source"] == "baseline":
            stream = self.archive.open(row["path"])
        else:
            stream = file_under(self.fallback, row["path"]).open("rb")
        with stream, Image.open(stream) as image:
            pixels = self.transform(ImageOps.exif_transpose(image).convert("RGB"))
        return pixels, row["class_index"]


def load_checkpoint(path, labels):
    checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    release = json.loads(RELEASE_MANIFEST.read_text(encoding="utf-8"))["vision"]
    old = release["class_labels"]
    size = WEIGHTS.transforms().crop_size[0]
    if (checkpoint.get("architecture") != "efficientnet_b2" or checkpoint.get("classes") != old
            or checkpoint.get("image_size") != size or labels[:len(old)] != old
            or labels[len(old):len(old) + 2] != list(FALLBACK_ORDER)
            or len(labels) != len(set(labels))):
        raise ValueError("Checkpoint or experiment class order does not match the release.")
    network = efficientnet_b2(weights=None)
    network.classifier[1] = nn.Linear(network.classifier[1].in_features, len(old))
    network.load_state_dict(checkpoint["model_state_dict"], strict=True)
    return network


def expand_classifier(model, size):
    old = model.classifier[1]
    expanded = nn.Linear(old.in_features, size, device=old.weight.device, dtype=old.weight.dtype)
    with torch.no_grad():
        expanded.weight[:old.out_features].copy_(old.weight)
        expanded.bias[:old.out_features].copy_(old.bias)
    model.classifier[1] = expanded


def process_epoch(model, loader, loss_fn, device, class_count, baseline_count, optimizer=None, blocks=(), stage=""):
    if optimizer:
        model.train()
        model.features.eval()
        for block in blocks:
            block.train()
    else:
        model.eval()
    confusion = torch.zeros(class_count, class_count, dtype=torch.long)
    hits = torch.zeros(class_count, dtype=torch.long)
    loss_total = 0.0
    loss_examples = 0
    batches = len(loader)
    progress_interval = max(1, (batches + 9) // 10)
    print(f"{stage}: {batches:,} batches on {device}", flush=True)
    with torch.set_grad_enabled(optimizer is not None):
        for batch, (images, targets) in enumerate(loader, 1):
            images, targets = images.to(device), targets.to(device)
            if optimizer:
                optimizer.zero_grad(set_to_none=True)
            logits = model(images)
            measured = targets < logits.size(1)
            measured_count = int(measured.sum())
            if measured_count:
                loss = loss_fn(logits[measured], targets[measured])
                loss_total += loss.item() * measured_count
                loss_examples += measured_count
            if optimizer:
                loss.backward()
                optimizer.step()
            probabilities = logits.detach().softmax(dim=1)
            choices = probabilities.topk(3, dim=1).indices
            correct = (targets[:, None] == choices).any(dim=1)
            predictions = choices[:, 0]
            indices = targets * class_count + predictions
            confusion += indices.cpu().bincount(minlength=class_count**2).reshape(class_count, class_count)
            hits += targets[correct].cpu().bincount(minlength=class_count)
            if batch % progress_interval == 0 or batch == batches:
                print(f"{stage}: {batch:,}/{batches:,} batches", flush=True)
    actual = confusion.sum(dim=1)
    total = int(actual.sum())
    f1 = 2 * confusion.diag() / (actual + confusion.sum(dim=0)).clamp(min=1)
    supported = int(actual[:baseline_count].sum())
    per_class = [
        {"images": int(actual[i]), "top1": int(confusion[i, i]) / max(1, int(actual[i])),
         "top3": int(hits[i]) / max(1, int(actual[i])), "f1": float(f1[i])}
        for i in range(class_count)
    ]
    return {"images": total, "loss_images": loss_examples, "loss": loss_total / max(1, loss_examples),
            "top1": int(confusion.diag().sum()) / total, "top3": int(hits.sum()) / total,
            "macro_f1": float(f1[actual > 0].mean()),
            "supported_top3": int(hits[:baseline_count].sum()) / max(1, supported),
            "per_class": per_class, "confusion": confusion.tolist()}


def collect_rows(plan, smoke):
    baseline = plan["baseline_classes"]
    scene_index = baseline + 1
    result = {}
    for split in ("train", "validation", "test"):
        rows = [row for row in plan["images"] if row["split"] == split]
        groups = defaultdict(list)
        for row in rows:
            groups[row["class_index"]].append(row)
        if smoke:
            if not groups[0] or not groups[baseline] or len(groups[scene_index]) < 2:
                raise ValueError(f"The smoke run needs a dish, one other-food photo and two non-food photos in {split}.")
            rows = groups[0][:1] + groups[baseline][:1] + groups[scene_index][:2]
        elif set(groups) != set(range(len(plan["classes"]))) or len(groups[scene_index]) != 2 * len(groups[baseline]):
            raise ValueError(f"Class coverage or the fallback ratio is invalid in {split}.")
        result[split] = rows
    return result


def train(args):
    torch.manual_seed(args.seed)
    torch.set_num_threads(args.threads)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    plan = json.loads(args.dataset.read_text(encoding="utf-8"))
    labels, baseline = plan["classes"], plan["baseline_classes"]
    network = load_checkpoint(args.checkpoint, labels).to(device)
    if baseline != network.classifier[1].out_features:
        raise ValueError("Prepared baseline class count differs from the checkpoint.")
    rows = collect_rows(plan, args.smoke)
    args.output.mkdir(parents=True, exist_ok=False)
    eval_transform = WEIGHTS.transforms()
    size = eval_transform.crop_size[0]
    train_transform = transforms.Compose([
        transforms.RandomResizedCrop(size, scale=(0.75, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(10),
        transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.15),
        transforms.ToTensor(),
        transforms.Normalize(eval_transform.mean, eval_transform.std),
    ])
    loss_fn = nn.CrossEntropyLoss(label_smoothing=0.1)
    best_score = -1.0
    history = []
    artifact = args.output / "efficientnet_b2_pilot.pt"
    with ExitStack() as archives:
        sets = {
            split: PilotImages(items, archives.enter_context(ZipFile(args.archives / f"{split}.zip")),
                               args.fallback, train_transform if split == "train" else eval_transform)
            for split, items in rows.items()
        }

        def loader(dataset, **kwargs):
            return DataLoader(dataset, batch_size=args.batch_size, pin_memory=device.type == "cuda", **kwargs)

        comparison = process_epoch(network, loader(sets["test"]), loss_fn, device, len(labels), baseline,
                                   stage="Baseline evaluation")
        expand_classifier(network, len(labels))
        network.features.requires_grad_(False)
        optimizer = torch.optim.AdamW(network.classifier.parameters(), lr=1e-3, weight_decay=1e-4)
        groups = defaultdict(list)
        for i, row in enumerate(rows["train"]):
            groups[row["class_index"]].append(i)
        draws = 1 if args.smoke else max(1, len(rows["train"]) // (len(labels) + 1))
        blocks = ()
        for epoch in range(1, args.epochs + 1):
            if epoch == 2:
                blocks = tuple(network.features[-2:])
                for block in blocks:
                    block.requires_grad_(True)
                optimizer = torch.optim.AdamW([
                    {"params": (p for block in blocks for p in block.parameters()), "lr": 3e-5},
                    {"params": network.classifier.parameters(), "lr": 3e-4},
                ], weight_decay=1e-4)
            indices = sample_epoch(groups, baseline + 1, draws, args.seed + epoch)
            loss = process_epoch(network, loader(sets["train"], sampler=indices), loss_fn,
                                 device, len(labels), baseline, optimizer, blocks, stage=f"Epoch {epoch} training")["loss"]
            metrics = process_epoch(network, loader(sets["validation"]), loss_fn, device, len(labels), baseline,
                                    stage=f"Epoch {epoch} validation")
            history.append({"epoch": epoch, "train_loss": loss, "validation": metrics})
            print(f"Epoch {epoch} | train loss {loss:.4f} | validation macro F1 {metrics['macro_f1']:.4f}", flush=True)
            if metrics["macro_f1"] > best_score:
                best_score = metrics["macro_f1"]
                temporary = artifact.with_suffix(".tmp")
                torch.save({
                    "architecture": "efficientnet_b2", "image_size": size, "classes": labels,
                    "model_state_dict": network.state_dict(), "epoch": epoch, "smoke": args.smoke,
                }, temporary)
                temporary.replace(artifact)
        selected = torch.load(artifact, map_location=device, weights_only=True)
        network.load_state_dict(selected["model_state_dict"], strict=True)
        test = process_epoch(network, loader(sets["test"]), loss_fn, device, len(labels), baseline,
                             stage="Candidate evaluation")
    report = {"classes": labels, "device": str(device), "smoke": args.smoke, "baseline": comparison,
              "history": history, "best_epoch": selected["epoch"], "test": test}
    (args.output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--archives", type=Path, required=True)
    parser.add_argument("--fallback", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, default=BASE_CHECKPOINT)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--seed", type=int, default=67)
    parser.add_argument("--smoke", action="store_true")
    args = parser.parse_args()
    if min(args.epochs, args.batch_size, args.threads) < 1:
        parser.error("Epochs, batch size, and threads must be positive.")
    if args.smoke:
        args.epochs = 2
    train(args)


if __name__ == "__main__":
    main()
