# Validate Store Screenshots

Check a repository's screenshot files before uploading them to an app store.
The Action emits file-level errors and manual-review warnings using
`@grunersoftware/store-screenshot-specs` version 0.1.0, the same rules used by the
free browser validator. Screen Studio Kit is not required.

## Example

Until published, copy this Action directory into `.github/actions/validate-store-screenshots`.
The bundled `dist/index.cjs` runs without an install step:

```yaml
name: Check screenshots
on: [push, pull_request]
permissions:
  contents: read
jobs:
  screenshots:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/validate-store-screenshots
        with:
          directory: store/en-US/iphone
          target: apple-iphone-69
          fail-on-error: 'true'
          fail-on-review: 'false'
```

Use a matrix for multiple locale/device directories. Each call checks one set.
After a public release, replace the local `uses` path with the published repository
and an immutable release commit. No Marketplace URL is claimed before publication.

| Input | Meaning |
| --- | --- |
| `directory` | Required path inside the checkout, non-recursive |
| `target` | Required supported target ID below |
| `fail-on-error` | Default `true`; `false` reports validation errors without failing |
| `fail-on-review` | Default `false`; `true` also fails for review warnings |

Configuration errors, missing/empty directories, and paths outside the workspace always
fail. Hidden files and subdirectories are ignored. All other entries are inspected;
keep README files elsewhere. Symlinks and unsupported/corrupt image data produce
file failures. Format comes from the bytes. PNG decoding checks CRCs, dimensions,
bit depth, color type, alpha channels and transparency chunks; JPEGs are decoded too.

Outputs: `failures` (failed files plus failed count check), `reviews` (files needing
review plus count warning), and `files` (visible non-directory entries). A summary is
written to the workflow run; filenames and validation problems appear in annotations.

## Coverage

| Targets | Validation |
| --- | --- |
| `apple-iphone-69`, `apple-iphone-65`, `apple-iphone-63`, `apple-iphone-61`, `apple-iphone-55`, `apple-iphone-47`, `apple-iphone-4`, `apple-iphone-35` | Exact sizes, JPEG/PNG, alpha, count |
| `apple-ipad-13`, `apple-ipad-129`, `apple-ipad-11`, `apple-ipad-105`, `apple-ipad-97`, `apple-mac` | Exact sizes, JPEG/PNG, alpha, count |
| `google-phone` | JPEG or 24-bit PNG, alpha, 320–3840px, maximum 2:1 ratio, count; promotional dimensions prompt review |
| `microsoft-desktop` | PNG, minimum 1366×768 or portrait equivalent, 50 MiB implementation threshold, count |

Google's minimum of two screenshots is across device types; a phone set with one image
prompts review. A green check does not prove promotional eligibility or store approval.
Apple/Google file-size limits are not asserted. Microsoft's documentation says 50 MB
without a byte definition; files close to the enforced 50 MiB threshold need an upload check.

For decoder safety, this Action caps files at 64 MiB, decoded images at 24 megapixels,
and sets at 100 files. These are Action limits, not store rules. The supported Apple
sizes fit those bounds. This Action does not check required languages, complete device
coverage, text overflow, screenshot content, or whether a store account accepts an upload.
Other store targets, including foldable-device upload slots, are unsupported.

## Privacy

Screenshot processing happens on the GitHub runner. The Action makes no network
requests and uploads no screenshots. Workflow logs contain filenames and validation
results and inherit the repository's visibility and retention settings. GitHub itself
hosts the workflow and repository; this is not an on-device-only execution claim.
No AI model receives screenshot data from this Action.

## Development and fixtures

In the website workspace, build the sibling specs package first, then run `npm ci`,
`npm run build`, and `npm test` here. The current lockfile uses the sibling package
until its first public npm release. Before extracting to a standalone public repository,
replace that dependency with exact version `0.1.0`, regenerate the lockfile, rebuild,
and rerun tests. The bundle already contains the shared rules and decoders.

`fixtures/passing/screenshots` and `fixtures/failing/screenshots` are small fixture
repository layouts for the `apple-iphone-69` target. Automated tests also cover JPEG,
corrupt PNG, oversized headers, empty sets, symlinks, unsupported targets, warnings,
and the bundled Action's exit behavior. Commit the bundle and dependency license notices.

MIT licensed. [Try the free browser validator](https://martingruner.com/tools/store-screenshot-validator).
[Screen Studio Kit](https://martingruner.com/projects/screenshot-studio) is an optional
app for designing screenshot sets.
