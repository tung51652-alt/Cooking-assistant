# CookLens vision checkpoint v1

- File: `efficientnet_b2_best.pt`; 31,434,209 bytes.
- SHA-256: `5be0c342c14f4f102ec851b0b5168e9953090624e93200d56359bdc7561fe67c`.
- Trainer: Phạm Hoàng Minh, as confirmed by the project owner on 2026-10-19.
- Architecture: torchvision EfficientNet-B2; 30 classes; input 288×288; fine-tune epoch 10. Ordered labels, transforms and reported metrics are in `deploy/artifacts/manifest.json`.
- Source code reference: CV branch commit `47e27285e7444a67675d27e98857c1d24e293f26`; experiment metadata reference `612c67b`.
- Training dataset source recorded by the project: 30VNFoods, <https://github.com/ds4v/30VNFoods>, <https://www.kaggle.com/datasets/quandang/vietnamese-foods>.

## Distribution permission and attribution

The project owner explicitly confirmed on 2026-10-19 that this checkpoint may be publicly distributed, including inside CookLens Docker images, and authorized publishing it via GitHub Releases. This records the owner's permission; it is not an independent audit of underlying dataset rights and does not assign an invented SPDX license to the checkpoint. The training dataset itself is not included in this release or runtime image.

The torchvision implementation uses BSD-3-Clause; its notice is included as `torchvision-LICENSE.txt`, sourced from <https://github.com/pytorch/vision/blob/v0.23.0/LICENSE>. This is the library's license, not a claim that the project's fine-tuned checkpoint or training images inherit that license. Preserve this provenance note and the relevant third-party notices when packaging the checkpoint.

## Artifact release, not application release

Tag `vision-model-v1` identifies these checkpoint bytes. Do not replace the asset under this tag; publish a new model version and update the pinned checksum for a new checkpoint. The tag points to the existing CV source commit, without merging branches or releasing the complete application. Reported metrics have not been re-benchmarked during Phase 0. Full stack evaluation, Docker publishing and recipe coverage belong to later phases.
