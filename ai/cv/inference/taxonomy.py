"""Read the shared taxonomy artifact; never derive canonical keys from predictions."""

from dataclasses import dataclass
import json
from pathlib import Path
import re
import unicodedata


@dataclass(frozen=True)
class Dish:
    class_id: int
    original_label: str
    normalized_dish: str
    display_name: str


def load_taxonomy(path: Path, expected_labels: list[str], version: str) -> tuple[Dish, ...]:
    data = json.loads(path.read_text())
    if data['taxonomy_version'] != version or len(data['labels']) != 30:
        raise ValueError('Taxonomy version or class count mismatch')
    dishes = []
    canonical = set()
    aliases = {}
    for index, item in enumerate(data['labels']):
        if type(item['class_id']) is not int or item['class_id'] != index:
            raise ValueError('Taxonomy indexes must follow checkpoint order')
        if item['original_label'] != expected_labels[index]:
            raise ValueError('Taxonomy training labels mismatch')
        key = item['normalized_dish']
        display = item['display_name']
        if not re.fullmatch(r'[a-z]+(?:_[a-z]+)*', key) or key in canonical:
            raise ValueError('Invalid or duplicate canonical dish')
        if not display.strip() or display != unicodedata.normalize('NFC', display):
            raise ValueError('Invalid display label')
        if not item['aliases']:
            raise ValueError('Missing dish aliases')
        for alias in item['aliases']:
            normalized = ''.join(c for c in unicodedata.normalize('NFD', alias.casefold().replace('đ', 'd'))
                                 if not unicodedata.combining(c))
            normalized = ' '.join(normalized.split())
            if not normalized or aliases.setdefault(normalized, index) != index:
                raise ValueError('Ambiguous dish alias')
        canonical.add(key)
        dishes.append(Dish(index, item['original_label'], key, display))
    return tuple(dishes)
