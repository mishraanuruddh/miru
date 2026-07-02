# Vendored engine

`sprites.js` and `gifts.js` are verbatim copies of `renderer/sprites.js` and
`renderer/gifts.js` so the landing page is self-contained (deployable as a
static folder). If the cat's art changes, refresh with:

```sh
cp renderer/sprites.js renderer/gifts.js site/vendor/
```
