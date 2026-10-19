"""Keep the training evaluation transform and full softmax probabilities."""

from PIL import Image
import torch
from torchvision.models import EfficientNet_B2_Weights

from .model import LoadedModel

evaluation_transform = EfficientNet_B2_Weights.IMAGENET1K_V1.transforms()


def predict_image(image: Image.Image, model: LoadedModel) -> list[dict]:
    with torch.inference_mode():
        batch = evaluation_transform(image).unsqueeze(0).to(model.device)
        probabilities = torch.softmax(model.network(batch), dim=1).squeeze(0)
        if probabilities.shape != (30,) or not torch.isfinite(probabilities).all():
            raise ValueError('Invalid model output')
        # Stable order preserves the lowest class index when probabilities tie.
        ordered = torch.argsort(probabilities, descending=True, stable=True)[:3].tolist()
        return [dict(rank=rank, class_id=index, normalized_dish=model.dishes[index].normalized_dish,
                     display_name=model.dishes[index].display_name, confidence=probabilities[index].item())
                for rank, index in enumerate(ordered, 1)]
