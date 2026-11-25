"""The release's E5 encoder; never contacts a model hub at runtime."""
import os

import torch
from transformers import AutoModel, AutoTokenizer

VERSION = "multilingual-e5-small-v1"
DIMENSION = 384


class Encoder:
    def __init__(self, directory):
        threads = int(os.getenv("TORCH_NUM_THREADS", "4"))
        if not 1 <= threads <= 32:
            raise ValueError("Invalid CPU thread limit")
        torch.set_num_threads(threads)
        self.tokenizer = AutoTokenizer.from_pretrained(directory, local_files_only=True, trust_remote_code=False)
        self.model = AutoModel.from_pretrained(directory, local_files_only=True, trust_remote_code=False,
                                               use_safetensors=True).eval()
        if self.model.config.hidden_size != DIMENSION:
            raise ValueError("Incompatible embedding model")

    @torch.inference_mode()
    def encode(self, texts, *, query=False):
        prefix = "query: " if query else "passage: "
        batch = self.tokenizer([prefix + text for text in texts], padding=True, truncation=True,
                               max_length=512, return_tensors="pt")
        output = self.model(**batch).last_hidden_state
        mask = batch["attention_mask"].unsqueeze(-1)
        pooled = (output * mask).sum(1) / mask.sum(1).clamp(min=1)
        return torch.nn.functional.normalize(pooled, p=2, dim=1).tolist()


def passage(recipe):
    return "\n".join([recipe["title"], recipe["normalized_dish"],
                      "; ".join(i["name"] for i in recipe["ingredients"]),
                      " ".join(s["text"] for s in recipe["instructions"])])
