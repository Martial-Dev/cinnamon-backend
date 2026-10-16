# Sample Hardhat 3 Project (`mocha` and `ethers`)

This project showcases a Hardhat 3 project using `mocha` for tests and the `ethers` library for Ethereum interactions.

To learn more about Hardhat 3, please visit the [Getting Started guide](https://hardhat.org/docs/getting-started#getting-started-with-hardhat-3). To share your feedback, join our [Hardhat 3](https://hardhat.org/hardhat3-telegram-group) Telegram group or [open an issue](https://github.com/NomicFoundation/hardhat/issues/new) in our GitHub issue tracker.

## Project Overview

This example project includes:

- A simple Hardhat configuration file.
- Foundry-compatible Solidity unit tests.
- TypeScript integration tests using `mocha` and ethers.js
- Examples demonstrating how to connect to different types of networks, including locally simulating OP mainnet.

## Usage

### Running Tests

To run all the tests in the project, execute the following command:

```shell
npx hardhat test
```

You can also selectively run the Solidity or `mocha` tests:

```shell
npx hardhat test solidity
npx hardhat test mocha
```

### Make a deployment to Sepolia

This project includes an example Ignition module to deploy the contract. You can deploy this module to a locally simulated chain or to Sepolia.

To run the deployment to a local chain:

```shell
npx hardhat ignition deploy ignition/modules/Counter.ts
```

To run the deployment to Sepolia, you need an account with funds to send the transaction. The provided Hardhat configuration includes a Configuration Variable called `SEPOLIA_PRIVATE_KEY`, which you can use to set the private key of the account you want to use.

You can set the `SEPOLIA_PRIVATE_KEY` variable using the `hardhat-keystore` plugin or by setting it as an environment variable.

To set the `SEPOLIA_PRIVATE_KEY` config variable using `hardhat-keystore`:

```shell
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
```

After setting the variable, you can run the deployment with the Sepolia network:

```shell
npx hardhat ignition deploy --network sepolia ignition/modules/Counter.ts
```

## Product QR Verification

Set `PUBLIC_VERIFICATION_BASE_URL` separately in each backend deployment. It must be the public Angular application origin, not the API origin.

| Environment       | `PUBLIC_VERIFICATION_BASE_URL`            |
| ----------------- | ----------------------------------------- |
| Local development | `http://localhost:4200`                   |
| Staging           | `https://verify-staging.canelaceylon.com` |
| Production        | `https://verify.canelaceylon.com`         |

Production requires HTTPS. New units receive a cryptographically random 256-bit token and use `/verify/<token>`. Do not reuse the removed `PUBLIC_TRACE_BASE_URL` setting. Existing units receive tokens when an administrator loads the batch list; export new labels to replace predictable legacy QR codes.

Batch anchoring requires `USE_REAL_BLOCKCHAIN=true`, `BLOCKCHAIN_RPC_URL`, `BLOCKCHAIN_PRIVATE_KEY`, and `BATCH_TRACEABILITY_CONTRACT_ADDRESS`. `BLOCKCHAIN_EXPLORER_URL` is optional. The backend queries the configured RPC provider for its network name when storing transaction receipts. `BatchTraceability` anchors one hash per batch and one Merkle root per anchoring run covering many unit movements; `verifyMovement(root, leaf, proof)` checks any single movement. See `BATCH_TRACEABILITY_SETUP.md`.

The unauthenticated endpoint is `GET /api/public/verify/:token` and is rate-limited. Operational batch and blockchain detail endpoints require administrator authentication. Supplier public names require explicit consent; public locations are restricted to country, province, or district regardless of finer stored precision.

Optional settings:

| Variable                              | Default | Purpose                                                                                                             |
| ------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `TRUST_PROXY`                         | unset   | Number of reverse-proxy hops (e.g. `1` behind nginx). Without it, every customer shares one rate-limit bucket.     |
| `PUBLIC_VERIFICATION_ALERT_THRESHOLD` | `25`    | Checks of one unit above which the public page shows "Unusual verification activity" and the admin page flags it. |
| `BLOCKCHAIN_QUERY_TIMEOUT_MS`         | `5000`  | Maximum wait for the on-chain hash check before the page falls back to "temporarily unavailable".                  |
| `BLOCKCHAIN_CONFIRMATIONS`            | `1`     | Blocks to wait before an anchor counts as recorded.                                                                 |
| `ANCHOR_DEBOUNCE_MS`                  | `60000` | Delay after a scan before anchoring, so a scanning session shares one transaction.                                  |
| `ANCHOR_INTERVAL_MS`                  | `600000`| Periodic anchoring run (safety net).                                                                                 |
| `ANCHOR_MAX_LEAVES`                   | `20000` | Most movements per Merkle tree / transaction.                                                                        |
| `ANCHOR_MAX_ROUNDS`                   | `10`    | Most anchoring transactions per run, so a large backlog clears in one run.                                          |
| `PUBLIC_HASH_CACHE_MS`                | `600000`| How long a customer scan reuses a batch's recomputed fingerprint.                                                    |
| `ANCHOR_MAX_ATTEMPTS`                 | `5`     | Retries before an anchor is marked failed.                                                                           |
| `ANCHOR_WORKER`                       | `true`  | Set `false` on all but one backend instance.                                                                         |

Run backend tests with `npm test` from this directory.
