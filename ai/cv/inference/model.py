"""Load the checkpoint format saved by Cooklen_30VNFoods.ipynb."""

from dataclasses import dataclass
from pathlib import Path
import os

import torch
from torch import nn
from torchvision.models import EfficientNet_B2_Weights, efficientnet_b2


DEFAULT_CHECKPOINT = (
    Path(__file__).resolve().parents[1]
    / "experiments/efficientnet-b2-30vnfoods-2026-09-30/efficientnet_b2_best.pt"
)


@dataclass(frozen=True)
class LoadedModel:
    network: nn.Module
    device: torch.device
    classes: tuple[str, ...]


def load_model() -> LoadedModel:
    checkpoint_path = Path(os.environ.get("FOOD_MODEL_PATH", DEFAULT_CHECKPOINT))
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=True)

    if not isinstance(checkpoint, dict) or checkpoint.get("architecture") != "efficientnet_b2":
        raise ValueError("Expected an efficientnet_b2 training checkpoint")
    if checkpoint.get("image_size") != EfficientNet_B2_Weights.DEFAULT.transforms().crop_size[0]:
        raise ValueError("Checkpoint image size does not match training evaluation transforms")

    classes = checkpoint.get("classes")
    if (
        not isinstance(classes, list)
        or not classes
        or not all(isinstance(label, str) and label.strip() for label in classes)
        or len(set(classes)) != len(classes)
    ):
        raise ValueError("Checkpoint must contain an ordered list of unique class names")

    # No ImageNet download: all trained weights come from the local checkpoint.
    network = efficientnet_b2(weights=None)
    network.classifier[1] = nn.Linear(network.classifier[1].in_features, len(classes))
    network.load_state_dict(checkpoint["model_state_dict"], strict=True)
    network.to(device)
    network.eval()
    return LoadedModel(network=network, device=device, classes=tuple(classes))
