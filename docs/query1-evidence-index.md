# Query1 evidence index

Only checksums, availability and restoration dependencies belong here. Product
decisions and aggregate outcomes are in [the concise report](query1-retrieval-quality.md).
Detailed per-case, token, latency, cost and transition records remain in ignored
artifacts; do not append another experiment diary to tracked documentation.

## Full reports preserved before condensation

The original reports are preserved byte-for-byte in local-only
`artifacts/archive/retrieval-quality-report-history-v1.tar.gz`, SHA-256
`7126912b0bef710f712125e6efe6a3342cff77a8e5633b72574dc35b363fee35`. Its six members pass full hash readback and configured-secret scanning.
All 49 prior archive hashes below were checked before removing active-tree prose.
No raw evidence, prior archive or original label is deleted or overwritten.

| Original document | Lines | SHA-256 of original bytes |
| --- | ---: | --- |
| `docs/query1-retrieval-quality.md` | 2931 | `5952fd44c92af865d1c18cb649b17cef1bc82fcf4c56f0cb97b1140aae4987be` |
| `docs/small-default-error-analysis.md` | 410 | `d410b1b161f9ff62fc3ad4a28396b0af1120a2e65a6458819b57a82c627a8e77` |

The full files also remain in Git history at
[`1546bebaa318cda4bd73c663f0f7276eef34ba44`](https://github.com/lambdadb/SillyMemory/commit/1546bebaa318cda4bd73c663f0f7276eef34ba44).
That preserves report prose, not downloadable raw run data.

## Availability and offline restoration

All archive paths are relative to this retained worktree's `artifacts/archive/`.
They are **local-only, not uploaded and unavailable in a fresh clone**. Do not remove
the worktree before another retained copy is verified. Each bundle contains its
manifest, frozen plan/producers, input/resource bounds and dependency locks. Extract
under ignored `artifacts/`, restore its source revision and required parent bundles,
then use its recorded offline verifier; current runtime code may no longer reproduce
historical results. Verification is distinct from sending new paid API calls.

Canonical LongMemEval-S dataset SHA-256:
`d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`.
Original judge-source SHA-256:
`ecce9c4c79dc89d99534ac17b383a5cbb5b9f0c69ee98adaf0684742e3d95251`.
Licensed dataset/source inputs remain explicit local dependencies; a checksum alone
is not a promise that a raw bundle can be downloaded.

## Immutable run archives

| Local archive filename | SHA 256 |
| --- | --- |
| `retrieval-stage-audit-v1.tar.gz` | `8852bc3095bcbb074ff55b60b0ba0a43aa3170b8dedd44031a4e5b15ef90898c` |
| `retrieval-stage-score-variation-v1.tar.gz` | `f9f9a78ebdab49f05484461ef912da0932d500264962e9df4b8043a050f59b7c` |
| `contextual-retrieval-pilot-v1.tar.gz` | `2ee7e4650f75c784fea728cfa4f5caf5e237736e5b2653afdfdfcf6eb08f776c` |
| `contextual-pilot-answers-v1.tar.gz` | `0557d38a0d62714b955fa03a9090060f4f3ecb24f77f8f1ff9f7eca02aa5ee3e` |
| `contextual-retrieval-full500-completed-v1.tar.gz` | `cb073911a2732f7ede8c5ed811b7c0d77576544deb9f63c842f99671ff127331` |
| `contextual-retrieval-full500-review-v1.tar.gz` | `cf55559fd5ac97672a53ca1b7591ba81648d19484c62e49ab2e5cd1b2f8aa3b9` |
| `helmet-vector-diagnosis-v1.tar.gz` | `edb107c93fe2b95dbeb01eefee38c1f861e66b53a90ef382cca1e47a1af77673` |
| `sdk-dev-depth-v1.tar.gz` | `4128d603350cb7f69b09ac0922ee7ae784cc3137e3fd10eba94c7ec8dc21302f` |
| `jev-candidate-200-pilot-v1.tar.gz` | `83e86165ae77817eb58d32b9ad1aa26478dd6eaeef1c53ec9600bf7911184140` |
| `vector-k-200-pilot-v1.tar.gz` | `7c7875a513c7850961fa9b31c15533d5f5481e6b5a4c9d60e8247f5d0d991bfd` |
| `retrieval-200-full500-v2.tar.gz` | `677ec026faedb8c3b44264659f793903f955a07123ffe35135ed27f989362230` |
| `date-provenance-path-audit-v1.tar.gz` | `b78ee2f69bf587191421f3c21525cc9915b6ed1dd036383166a87b704914260f` |
| `date-provenance-full500-v1.tar.gz` | `fad914851997b3d5886e16999c2a0cf3373422cb66b3e00acf17ced9297f6311` |
| `date-provenance-answers500-v1.tar.gz` | `2c67e0084789f7deba15ef33c147eb64a6154284bcb16cafa412af328d30f39d` |
| `session-time-map-full500-v1.tar.gz` | `aa1f8dd391cc8264353889444cc08c3044d64283f797aad6b36b86230681fa6b` |
| `muir-woods-injection-audit-v1.tar.gz` | `d6869cd65f55222ccbf240e16140173479a45af25f8be504b585ef49820e52ea` |
| `ranked-assembly-full500-v1.tar.gz` | `67c7e20e67aa4fae22b318c33d46074cc0e5d2cc4e18ec7efa6824b59ee6bb35` |
| `ranked-assembly-answers500-v1.tar.gz` | `8008b97f410c69a692215b7790a64dc7c109fe35969ceb3461981956bfeff519` |
| `ranked-depth200-full500-v1.tar.gz` | `734bd6474f74442666e981dc024c276cdede472202c94c8c6f58c312a1a40b7f` |
| `ranked-depth200-answers500-v1.tar.gz` | `71088cf776717fa53e80ac1ff4dbdbb007a78aed419c504c30f5f9b1047a8a41` |
| `sol-judge-audit1000-v1.tar.gz` | `76688b7fe665f473e18690778b59190462acfffa77adcf4ec4f191cd44089e4a` |
| `query1-errors31-v1.tar.gz` | `91195674a65ed93fdc3eec419665e9c1fde9cc8ad8c6b0ac8decf2cac320062f` |
| `embedding-large-full500-v1.tar.gz` | `0a823a8e71683970f6a2e9e852aaa854e34b16ed46df45ee7ac27f14b76c86ca` |
| `embedding-large-answers500-v1.tar.gz` | `4050546035a4fe30f08733d3bb52062d82c0a62ecb59a3f36675af814d190629` |
| `compact-date-provenance500-v1.tar.gz` | `01c6df24b1dceeeb7527509a55611fa183341250c7cffc251b3491155e84b79f` |
| `sent-date-delivery500-v1.tar.gz` | `f28bc1bcaca48ac34bbe657ef04731c45a8192d652e5dec0ce9884701086c145` |
| `sent-budget4096-8192-500-v1.tar.gz` | `994cd09369a2d50208aec38d3501db833afefaf3468d6d37efd346d07d29550a` |
| `embedding-voyage500-v1.tar.gz` | `94f9296bf35d070daeeba327c02097e94aff0a66e89e47fe24f40c915068a1c7` |
| `embedding-voyage-answers500-v1.tar.gz` | `543314272d33d578305f279a4edfb49413d6ac9ace563d7c1d98d1a8b9964ccf` |
| `embedding-large-sent-comparison500-v1.tar.gz` | `b2da2d42147729b8d99e6eeba2331e4b8cdf68b37d6c7871d0d8e2c721ee605c` |
| `lambdadb-cost-baseline-v1.tar.gz` | `87bdae13c0fcdb3b182df4276cd0dd8b62a55f90c8e6b9cc185dcb6763c27f9e` |
| `rerank-voyage-large500-blocked-v1.tar.gz` | `c04202668146d519dbec4283ff418050b7afd7816092990039f2466fe03c0fc1` |
| `rerank-voyage-large500-completed-v1.tar.gz` | `d339cea17fbdb61bcdb2d419887ca8184a4f0599e116474bbced08a36f8ea345` |
| `luna-judge-large-jev500-v1.tar.gz` | `12213a97e4d3a1b40a60312fac820248a9beb1d867757ce311fdfa4e193b9156` |
| `luna-mem0-judge-large-jev500-v1.tar.gz` | `2d47edffa73e83a6f283bf5425a724cdfb4e8868bda267fca15d96cc0011d426` |
| `luna-generator-default500-v1.tar.gz` | `a78fa1c91f4ce2b3d846318f3ef3dfd60bdef44a4b5cdb58d66f1e88e1f6c8f9` |
| `sol-medium-generator500-v1.tar.gz` | `b79313c5e0444cc630c822677cc0a772c8a26c3487ad59b66db975140d68b3d7` |
| `embedding-small-large-matched500-v1.tar.gz` | `f5e572d54934e08056bb5bd86eedd85204baa2427de0aeb13f958a7128ec2fe2` |
| `small-default-error-audit-v1.tar.gz` | `b37a68fcd84ba86ae1d178ddd2701d5e4bbd910161971e80cb31f14fe8f08c85` |
| `small-retrieval-stage3-v1.tar.gz` | `ed8abb6acd4271b5009ef7583712a21973bf7dbbb755c45a7aed4c9cbbe81c8b` |
| `small-depth100-200-sent500-v1.tar.gz` | `93255946e574588a899c81056c209a869048a73b249ef3af5c3998b7001c6a93` |
| `depth200-product-adoption-v1.tar.gz` | `cc4a2ead26f80b1b2be381927a1455b26aef636658431e21772e7ff00d782caa` |
| `small-rerank100-200-k200-sent500-v1.tar.gz` | `dd18be5cc97441e835d040e42e9f913fb89c17cb659e482431f4c5a0a1363791` |
| `judge-minimal-clarification500-v1.tar.gz` | `8e37411b62645340d83594c4deacd5a848be1a632bbbd391f41fc5e00ada346c` |
| `generation-guidance-paired500-v1.tar.gz` | `d58ee5cbd4400e62727ca0ad99f4ccb90cb22a3a779013d8956d0942ba6fbe7a` |
| `guidance-default-errors29-v1.tar.gz` | `16dfd2db8af2e33ce52088b80e44ccd4576013758198cfa01717f1c95057cc6e` |
| `memory-presentation-order-v1.tar.gz` | `5b9a509f137574b11467e02e537dcb4df959c289349c1090fbbb9371ed1b14a3` |
| `minimal-guidance-ablation-v1.tar.gz` | `3f9cf9e06f9be8ef829be7a7b8785f46f96191a0abc5835dd10bb73dbcf0427b` |
| `followup-guidance-ablation-v1.tar.gz` | `a02fd108e2f4b4118710d14eba35f6ba7ca69424f92d7262051dbe6de43165a5` |
| `followup-guidance-full500-v1.tar.gz` | `a03a0ee5ae1ac9e7064fd6360c8d4175a7fdd662ea6b8560e314cb94b77c5397` |
