"""Keep the training evaluation transform and full softmax probabilities."""

from PIL import Image, ImageOps
import torch
from torchvision.models import EfficientNet_B2_Weights

from .errors import VisionError
from .model import LoadedModel

evaluation_transform = EfficientNet_B2_Weights.IMAGENET1K_V1.transforms()
FALLBACK_ERRORS = {
    'other_food': ('OTHER_FOOD', 'Món trong ảnh nằm ngoài danh mục CookLens. Bạn có thể chọn món theo tên.'),
    'non_food': ('NON_FOOD', 'Ảnh này có vẻ không phải ảnh món ăn. Hãy thử ảnh khác hoặc chọn món theo tên.'),
}


def predict_image(image: Image.Image, model: LoadedModel) -> list[dict]:
    with torch.inference_mode():
        if model.supports_fallback:
            with ImageOps.exif_transpose(image) as oriented:
                pixels = evaluation_transform(oriented)
        else:
            pixels = evaluation_transform(image)
        batch = pixels.unsqueeze(0).to(model.device)
        probabilities = torch.softmax(model.network(batch), dim=1).squeeze(0)
        if probabilities.shape != (len(model.classes),) or not torch.isfinite(probabilities).all():
            raise ValueError('Invalid model output')
        # Stable order preserves the lowest class index when probabilities tie.
        ranked = torch.argsort(probabilities, descending=True, stable=True).tolist()
        winner = ranked[0]
        if winner >= len(model.dishes):
            code, message = FALLBACK_ERRORS[model.classes[winner]]
            raise VisionError(422, code, message)
        ordered = [index for index in ranked if index < len(model.dishes)][:3]
        return [dict(rank=rank, class_id=index, normalized_dish=model.dishes[index].normalized_dish,
                     display_name=model.dishes[index].display_name, confidence=probabilities[index].item())
                for rank, index in enumerate(ordered, 1)]
