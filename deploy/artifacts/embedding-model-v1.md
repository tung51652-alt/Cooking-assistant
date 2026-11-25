# Local embedding bundle v1

Model: [intfloat/multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small), E5 authors, MIT license claim in the model card. Implementation/license provenance: [Microsoft UniLM E5](https://github.com/microsoft/unilm/tree/master/e5), notice in `notices/multilingual-e5-LICENSE.txt`.

Six upstream model/tokenizer files are listed in the artifact manifest. The fetch script validates their bytes against upstream metadata entirely in memory, using one upstream revision for the whole transfer. It never persists or outputs those validation/revision values. Changed weight size requires a new review. Existing invalid files are preserved and rejected, never silently replaced.

The upstream acquisition script is `stage_embedding_from_upstream.py`, used when reviewing a new artifact. Normal builds use `fetch_embedding_model.py` and the public [embedding-model-v1 artifact](https://github.com/tung51652-alt/Cooking-assistant/releases/tag/embedding-model-v1), rather than following the moving model-hub branch. The release ZIP contains six model files plus license and notice. Its transfer validation metadata is consumed only in memory. This artifact release contains no application runtime and is not application v2.0.0.

Runtime uses only the bundled local directory, CPU inference, attention-mask mean pooling, L2 normalization and 384-dimensional cosine similarity. Prefixes are `query: ` and `passage: `; sequences are truncated to 512 tokens. No automatic model/LLM download at startup. Recipe text format `recipe-plain-v1` is title, canonical dish, ingredient names and ordered instructions.

The model is an embedding baseline, not an assurance of culinary accuracy. Agent-authored evaluation queries require independent review; partial corpus coverage does not pass the release gate even if filtered searches perform well.
