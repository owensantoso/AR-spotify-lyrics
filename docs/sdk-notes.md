# SDK Notes

## Local Patch In Use

The installed Mentra SDK under `node_modules` currently has a local patch to ignore `device_state_update`.

Patched file:
- [`node_modules/@mentra/sdk/dist/app/session/index.js`](/Users/macintoso/Documents/VSCode/mentra-g1-app/node_modules/@mentra/sdk/dist/app/session/index.js)

## Why It Exists

The G1 can send `device_state_update` messages during session setup. The current installed SDK version treats unknown message types as fatal and tears down the session. The local patch changes that behavior to ignore this specific message so the session can stay alive.

## Risk

- reinstalling dependencies can overwrite the patch
- updating the SDK may remove the need for it or conflict with it

## Desired End State

Remove the local patch once the upstream SDK handles `device_state_update` natively.
