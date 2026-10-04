"""Use the exact deterministic validation/test preset from the training notebook."""

from PIL import Image
import torch
from torchvision.models import EfficientNet_B2_Weights

from .model import LoadedModel


# Matches notebook cell 8: evaluation_transform = weights.transforms().
evaluation_transform = EfficientNet_B2_Weights.DEFAULT.transforms()


def predict_image(image: Image.Image, model: LoadedModel) -> dict[str, str | int | float]:
    with torch.inference_mode():
        batch = evaluation_transform(image).unsqueeze(0).to(model.device)
        logits = model.network(batch)
        probabilities = torch.softmax(logits, dim=1)
        confidence, prediction = probabilities.max(dim=1)
        class_id = prediction.item()
        return {
            "label": model.classes[class_id],
            "class_id": class_id,
            "confidence": round(confidence.item(), 4),
        }
