"""Load and validate all runtime artifacts once, without any network operation."""

from dataclasses import dataclass
import json
import os
from pathlib import Path

import torch
from torch import nn
from torchvision.models import EfficientNet_B2_Weights, efficientnet_b2

from .taxonomy import Dish, load_taxonomy

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CHECKPOINT = ROOT / 'deploy/artifacts/staging/vision/efficientnet_b2_best.pt'
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


def load_model() -> LoadedModel:
    manifest = json.loads(MANIFEST.read_text())
    vision = manifest['vision']
    path = Path(os.environ.get('FOOD_MODEL_PATH', str(DEFAULT_CHECKPOINT)))
    taxonomy_path = Path(os.environ.get('FOOD_TAXONOMY_PATH', str(DEFAULT_TAXONOMY)))
    threads = int(os.environ.get('TORCH_NUM_THREADS', '4'))
    if not 1 <= threads <= 32:
        raise ValueError('Invalid CPU thread configuration')
    torch.set_num_threads(threads)
    if path.stat().st_size != vision['size_bytes']:
        raise ValueError('Checkpoint size mismatch')
    checkpoint = torch.load(path, map_location='cpu', weights_only=True)
    if not isinstance(checkpoint, dict) or checkpoint.get('architecture') != vision['architecture']:
        raise ValueError('Unexpected checkpoint architecture')
    preset = EfficientNet_B2_Weights.IMAGENET1K_V1.transforms()
    if checkpoint.get('image_size') != preset.crop_size[0]:
        raise ValueError('Unexpected checkpoint image size')
    classes = checkpoint.get('classes')
    if classes != vision['class_labels'] or len(classes) != 30 or len(set(classes)) != 30:
        raise ValueError('Checkpoint class order mismatch')
    recorded = vision['transform']
    if (preset.crop_size != recorded['crop_size'][:1] or preset.resize_size != [recorded['resize_short_edge']]
            or preset.mean != recorded['mean'] or preset.std != recorded['std']
            or preset.interpolation.value != recorded['interpolation'] or not preset.antialias):
        raise ValueError('Evaluation preprocessing mismatch')
    dishes = load_taxonomy(taxonomy_path, classes, manifest['taxonomy_version'])
    network = efficientnet_b2(weights=None)
    network.classifier[1] = nn.Linear(network.classifier[1].in_features, len(classes))
    network.load_state_dict(checkpoint['model_state_dict'], strict=True)
    network.eval()
    return LoadedModel(network, torch.device('cpu'), tuple(classes), dishes,
                       vision['model_version'], manifest['taxonomy_version'])
