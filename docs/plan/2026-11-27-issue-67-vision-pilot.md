# Issue 67 vision pilot training

Prepare a repeatable experiment for [issue #67](https://github.com/tung51652-alt/Cooking-assistant/issues/67).
Use the existing EfficientNet-B2 checkpoint and fixed 30VNFoods splits alongside the [screened fallback collection](../../data/raw/vision-data-candidates.md).

- Validate the three source archives against the clean split manifest.
  Check fallback photos against the original split images for exact and likely visual duplicates.
  Keep held photos out of the experiment and use screened reserves from their recorded splits where possible.
- Preserve the checkpoint's 30 class positions and append the two fallback outputs.
  Preserve the 2:1 fallback photo ratio in each split and sample non-food twice as often as an ordinary class during training.
- Use the current evaluation preprocessing and write candidate weights and held-out metrics to a new output directory.
  Verify a bounded CPU smoke run against the real checkpoint and reserve full evaluation for the experiment.

## Run the pilot

Open [Cooklen_30VNFoods.ipynb](../../ai/cv/training/Cooklen_30VNFoods.ipynb) with the CookLens Vision kernel and choose **Run All**.
The notebook validates the inputs, prepares or reuses the audited manifest, trains for three epochs, and evaluates the selected checkpoint.
On this workspace, the ignored `ai/cv/runs/issue-67/inputs.json` points to the prepared local inputs.
On another machine, set the input paths in the first cell.
Each run writes a checkpoint and report to a timestamped directory.
If the promotions or fallback manifest change, the notebook builds a fresh audit manifest.
The command-line entry points below use the same code. [Original 30-dish notebook](https://github.com/tung51652-alt/Cooking-assistant/blob/v2.0.0/ai/cv/training/Cooklen_30VNFoods.ipynb)

### Colab data extension

Reuse the 4.6 GB `cooklens-67-inputs.zip` already in My Drive and stage a small `cooklens-67-round2-addon.zip` alongside it after reviewing the candidates.
The notebook checks the add-on against the base manifest, preserves the old image rows, and continues from the epoch 4 checkpoint already in Drive.
The add-on carries its proposed split assignments and only the additional images. Use eligible non-food reserves before adding new non-food photos to preserve the two-to-one balance in every split.
Verify the exact merged counts, split and group boundaries, and rejection of missing images or an unrelated base archive before exporting to Colab.

### Integrate the epoch 5 checkpoint

- Stage the selected checkpoint locally and validate the 30 dish positions and two appended fallback classes. Keep the published 30-class artifact available to existing release builds.
- Route top-ranked `other_food` and `non_food` results to typed manual recovery. Return three supported dishes when a supported dish ranks first. The 32-class model uses class predictions without a fixed confidence cutoff.
- Pass the typed outcomes and model version through the gateway and the shared web and Expo client. Keep the 30-dish catalog and confirmation flow intact.
- Exercise real checkpoint loading, fallback routing, supported predictions below the legacy cutoff, and the existing release contract.

### Display confidence on web and Expo

- Apply the epoch 5 display rules in the shared client while retaining the legacy response behavior.
- Show dish candidates from 7% and highlight the top dish as “Món gợi ý” from 54%.
- Append “(Khả năng cao)” from 70% and “(Khả năng rất cao)” from 90%. Keep percentages on possible dishes and alternatives.
- Exercise threshold boundaries, empty suggestions, and confirmation from the filtered candidate list.

Use a Python environment with PyTorch, Torchvision, and Pillow.
On another machine, install `ipykernel` in that environment and register it with `python -m ipykernel install --user --name cooklens-vision --display-name "CookLens Vision"`.
For CPU setup, the vision workflow uses `torch==2.14.1` and `torchvision==0.29.1` from the [official CPU wheel index](https://download.pytorch.org/whl/cpu).
For GPU training, use a [PyTorch build compatible with the training machine](https://pytorch.org/get-started/locally/).

Put `train.zip`, `validation.zip`, and `test.zip` from the [30VNFoods mirror](https://huggingface.co/datasets/vuongnhathien/30VNFoods/tree/main) into the same external folder.
Point `--fallback` at the local fallback collection with `manifest.jsonl`, `promotions.json`, and `images/`.
Keep the image archives and checkpoint outside Git. The original data's [license and provenance record](../../data/raw/source-manifest.json) applies.

```text
python -m ai.cv.training.pilot_data --archives /path/to/30vnfoods --fallback /path/to/fallback-pilot --output /path/to/run/prepared.json
python -m ai.cv.training.train_pilot --dataset /path/to/run/prepared.json --archives /path/to/30vnfoods --fallback /path/to/fallback-pilot --output /path/to/run/candidate
```

Preparation reads all three archives, checks the original paths and class order, and writes a new audit manifest after the scan completes.
Digest and visual fingerprints are used in memory.
Holds and potential duplicates stay in the intake record and are listed in the preparation report.
Use a new output path when rerunning preparation with a changed promotion map.

Training reads archive members directly.
The first epoch trains the enlarged head, then the last two feature blocks join fine-tuning at a lower learning rate.
The epoch draws twice as many non-food samples as each other class.
When a class has fewer unique photos than its draw count, the sampler repeats shuffled passes over that class.
The best validation macro F1 selects the candidate.
The report compares the existing model and candidate on the same held-out photos, including supported-dish top-three accuracy and fallback false suggestions under the current 65% policy.
The candidate checkpoint carries the experiment class order and is separate from the release checkpoint.

Add `--smoke --batch-size 4` and use a new output directory for a two-step check that exercises head training, feature fine-tuning, and checkpoint reload.
The smoke report covers four images per split.

## Local verification

The preparation run decoded 25,032 original split images and found no exact or likely visual matches with the 576 screened fallback candidates.
The final experiment manifest lists 25,584 photos for 32 outputs.
It includes 278 `non_food` and 139 `other_food` training photos, 46 and 23 validation photos, and 44 and 22 test photos.
Twenty-one visually flagged photos and three photos with unresolved source metadata remain on hold.

The notebook ran end to end in a Jupyter kernel on a 99-photo verification slice covering all 32 labels and all three splits.
It initialized from the pinned checkpoint, completed both normal training stages, reloaded the selected checkpoint, and generated the held-out report.
Full training and performance evaluation remain pending.
