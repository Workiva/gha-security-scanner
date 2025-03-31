# gha-security-scanner

Generates and uploads SARIF files to GitHub Advanced Security.

## Rebuilding `dist`

If [check-dist.yaml](.github/workflows/check-dist.yml) fails, it probably means
that a transient dependency has changed. To fix it, rebuild `dist` like this and
commit it.

```
$ rm -rf dist node-modules
$ npm install
$ npm run bundle
```
