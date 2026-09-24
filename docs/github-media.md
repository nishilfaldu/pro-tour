# GitHub media upload prerequisite

The media preflight uploads two distinct synthetic four-second MP4s with the supplied `GH_MEDIA_TOKEN`, reads the resulting comment back through the API, and checks that it contains exactly two brief labels and two genuine GitHub attachment URLs. Both local Linux arm64 and GitHub Actions Linux amd64 uploads passed, and both pairs played to completion in an anonymous GitHub PR conversation. This is P05 evidence, not the automatic PR-to-tours product.

The dedicated public repository is [nishilfaldu/pro-tour-task-board-demo-20260924-122700](https://github.com/nishilfaldu/pro-tour-task-board-demo-20260924-122700), owned by `nishilfaldu`, repository ID `1386476546`. The media token reports push/admin access. [Bootstrap PR #1](https://github.com/nishilfaldu/pro-tour-task-board-demo-20260924-122700/pull/1) adds only a preflight marker. The task board and status-filter feature PR remain separate work. Recorded metadata, image/source hashes, tests, browser playback, and CI evidence are in [coding visit 006](evidence/coding-006/README.md).

## Pinned tool and upload route

The installed system `gh 2.94.0` lacks `--attach`. This implementation verifies and installs GitHub CLI **2.101.0** in a task-local path and in the uploader image; it never depends on the system binary. The [official attachment documentation](https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli) and [command reference](https://cli.github.com/manual/gh_pr_comment) describe repeated `--attach` flags and replacement of local Markdown references. SHA-256 pins in `src/pro_tour/github_media.py` match the [official release](https://github.com/cli/cli/releases/tag/v2.101.0). Verification uses fixed archive digests and the release's checksum list, not an independent signature attestation.

| Release archive | SHA-256 |
| --- | --- |
| `gh_2.101.0_macOS_arm64.zip` | `e4303e39d8f07141c4bad4b99b01079f05029c59b27076e8fbc825c985ecdd8b` |
| `gh_2.101.0_linux_arm64.tar.gz` | `b57e8063f18862647c9d22727c32e9da1b963f8bf9db648fe123a6975695640f` |
| `gh_2.101.0_linux_amd64.tar.gz` | `9bca2d1c16825f109907a23307628a2f0698fbf99662b73a5cf0b020293072b8` |

Source inspection at CLI commit `0cf1092493af067646fc5f3db9421c6a6ec9c938` establishes the [attachment upload request](https://github.com/cli/cli/blob/0cf1092493af067646fc5f3db9421c6a6ec9c938/internal/attachments/client.go): HTTPS to `uploads.github.com/user-attachments/assets`, with the repository ID, content type, and filename. Metadata/comment operations use `api.github.com`. These are the only uploader gateway destinations; the real local and CI calls succeeded with that allowlist. `cafe.github.com` telemetry was denied without preventing uploads. Browsers later fetch playback bytes from GitHub's media CDN; that is independent of uploader network access.

## Trust boundary

The trusted checker reads one literal media token assignment without evaluating shell syntax. Docker receives it through private stdin, never command arguments or a mount. The uploader creates a fresh home/config/current directory for every CLI call and maps only that token to `GH_TOKEN`. Ambient `GH_TOKEN`, `GITHUB_TOKEN`, login files, Git config, provider credentials, and helper/model settings are excluded. No model is called.

The uploader is an unprivileged, read-only, capability-dropped container with `no-new-privileges`, a memory limit, and no network namespace access. It has only its private gateway socket volume, mounted read-only; no host filesystem or Docker socket is mounted. The separate secret-free gateway accepts Unix-socket CONNECT requests to the two fixed HTTPS hosts, rejects private DNS results, and records destinations without headers or payloads. Real allow/deny probes run before the key is read. This preflight does not run PR code or establish the future app/build/browser boundary on Actions.

The image generates the synthetic fixtures without credentials. FFprobe verifies H.264/yuv420p, 640×360, 96 frames and four seconds; FFmpeg fully decodes both before upload. Distinct checksums are required. Image/source manifests identify the exact tested bytes. The Python base image is pinned by digest; Debian packages are not snapshot-pinned, so rebuilt image and clip digests can differ. The Linux arm64 and amd64 fixtures do differ and are recorded separately.

## Reproduce locally

These commands perform real writes and add another preflight comment to PR #1. Use fresh output paths. The default mode without `--repo`/`--pr` is a one-time bootstrap and refuses to modify a repository that already exists.

On Linux arm64 Docker, download the pinned asset, then build the credential-free image:

```sh
curl --fail --location \
  https://github.com/cli/cli/releases/download/v2.101.0/gh_2.101.0_linux_arm64.tar.gz \
  --output /tmp/pro-tour-gh-arm64.tar.gz
uv run --locked python scripts/prepare_github_media.py \
  --archive /tmp/pro-tour-gh-arm64.tar.gz --platform linux_arm64 \
  --output /tmp/pro-tour-media-image-new.json
```

For Linux amd64, change both asset and `--platform` to `linux_amd64`. The installer validates the embedded checksum before extracting only the expected executable. Read `image_id` from the generated manifest and pass it literally to the check; the already-tested local arm64 image can also be reused:

```sh
uv run --locked python scripts/check_github_media.py \
  --image sha256:85b8dbec4836e39213941d0d59db129bc4a1cc2fea29d9fc45cd955e35c7609b \
  --output /tmp/pro-tour-media-new.json --secrets-file .env.local \
  --repo nishilfaldu/pro-tour-task-board-demo-20260924-122700 --pr 1
```

The checker cleans up its containers and volumes. A successful report deliberately leaves `inline_playback_verified: false`: upload/readback cannot establish playback. Open its comment URL in a fresh anonymous browser context, confirm two native players, play each from zero to completion, inspect errors and actual frames, and retain separate evidence. Do not persist GitHub's temporary signed media query strings or a browser profile.

## Actual CI proof

[Run 36073840252](https://github.com/nishilfaldu/pro-tour-task-board-demo-20260924-122700/actions/runs/36073840252) passed on `ubuntu-24.04` x86_64. It ran `workflow_dispatch` on trusted default-branch commit `c7de091bb67a8d944d21ae6301ac39d196b7c8d1`. The installed workflow is byte-for-byte [the repository example](../examples/workflows/github-media-preflight.yml). It is manually dispatched prerequisite verification, not the required automatic PR event workflow.

The implementation repository is private. CI therefore uses only ten explicitly exported preflight source files under `.pro-tour/preflight/` in the disposable public repository, with per-file SHA-256 values and implementation commit `8ddf41af6c8d6c7cf4c58dcf658c218f3c5a7d09` in `source-manifest.json`. It downloads the exact public demo SHA and checks those hashes before execution. No unrelated private repository contents were exported. Only the upload step receives `GH_MEDIA_TOKEN`; it passes the token through a private temporary file to the isolated checker and removes the file afterward. No other supplied secret is configured or used by this workflow.

The normal Git OAuth credential could not install the workflow because it lacks `workflow` scope. The authorized GitHub connector installed the exact trusted file successfully; media uploads still exclusively used the supplied media token in the isolated CLI. The run retained four sanitized JSON artifacts for 30 days. Committed copies preserve evidence beyond that retention period; these artifacts are diagnostics, not a replacement for inline video attachments.

## Remaining publisher work

The [pinned CLI attachment implementation](https://github.com/cli/cli/blob/0cf1092493af067646fc5f3db9421c6a6ec9c938/internal/attachments/attach.go) can continue with a partial body after a later attachment fails. The preflight records this possibility on failure and validates a complete pair after successful upload. It does not promise atomic publication or idempotent reruns. P18 must implement complete-pair publication, current-head checks, and safe retry/update behavior before this route becomes the product publisher. No task-board tour, Jev integration, recording mechanism, or end-to-end acceptance is established by these synthetic clips.
