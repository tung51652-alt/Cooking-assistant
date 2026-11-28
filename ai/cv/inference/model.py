"""Load and validate all runtime artifacts once, without any network operation."""

import json
import os
from dataclasses import dataclass
from pathlib import Path

import torch
from torch import nn
from torchvision.models import EfficientNet_B2_Weights, efficientnet_b2

from .taxonomy import Dish, load_taxonomy

ROOT = Path(__file__).resolve().parents[3]
CHECKPOINT_DIR = ROOT / 'deploy/artifacts/staging/vision'
DEFAULT_TAXONOMY = ROOT / 'data/processed/30vnfoods-label-map.json'
MANIFEST = ROOT / 'deploy/artifacts/manifest.json'


@dataclass(frozen=True)
class LoadedModel:
    network: nn.Module
    device: torch.device
    classes: tuple[str, ...]
    dishes: tuple[Dish, ...]
    model_version: str
    taxonomy_version: str

    @property
    def supports_fallback(self) -> bool:
        return len(self.classes) > len(self.dishes)


def load_model() -> LoadedModel:
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    vision = manifest['vision']
    candidate = manifest['vision_candidate']
    default_path = CHECKPOINT_DIR / candidate['filename']
    path = Path(os.environ.get('FOOD_MODEL_PATH', str(default_path)))
    using_candidate = path.name == candidate['filename']
    artifact = candidate if using_candidate else vision
    taxonomy_path = Path(os.environ.get('FOOD_TAXONOMY_PATH', str(DEFAULT_TAXONOMY)))
    threads = int(os.environ.get('TORCH_NUM_THREADS', '4'))
    if not 1 <= threads <= 32:
        raise ValueError('Invalid CPU thread configuration')
    torch.set_num_threads(threads)
    if path.stat().st_size != artifact['size_bytes']:
        raise ValueError('Checkpoint size mismatch')
    checkpoint = torch.load(path, map_location='cpu', weights_only=True)
    if not isinstance(checkpoint, dict) or checkpoint.get('architecture') != vision['architecture']:
        raise ValueError('Unexpected checkpoint architecture')
    preset = EfficientNet_B2_Weights.IMAGENET1K_V1.transforms()
    if checkpoint.get('image_size') != preset.crop_size[0]:
        raise ValueError('Unexpected checkpoint image size')
    classes = checkpoint.get('classes')
    dish_labels = vision['class_labels']
    expected_classes = dish_labels + candidate['fallback_labels'] if using_candidate else dish_labels
    if classes != expected_classes or len(set(classes)) != len(expected_classes):
        raise ValueError('Checkpoint class order mismatch')
    if using_candidate and (checkpoint.get('epoch') != candidate['checkpoint_epoch']
                            or checkpoint.get('smoke') is not False):
        raise ValueError('Unexpected candidate checkpoint epoch')
    recorded = vision['transform']
    if (preset.crop_size != recorded['crop_size'][:1] or preset.resize_size != [recorded['resize_short_edge']]
            or preset.mean != recorded['mean'] or preset.std != recorded['std']
            or preset.interpolation.value != recorded['interpolation'] or not preset.antialias):
        raise ValueError('Evaluation preprocessing mismatch')
    dishes = load_taxonomy(taxonomy_path, dish_labels, manifest['taxonomy_version'])
    network = efficientnet_b2(weights=None)
    network.classifier[1] = nn.Linear(network.classifier[1].in_features, len(classes))
    network.load_state_dict(checkpoint['model_state_dict'], strict=True)
    network.eval()
    return LoadedModel(network, torch.device('cpu'), tuple(classes), dishes,
                       artifact['model_version'], manifest['taxonomy_version'])
