## Installl

```
yarn
yarn build:examples
```

## Modify examples/index.html

`examples/index.html` points to `build.prod.js` when in dev mode. Manually change it to `build.dev.js`.


## Watch

run `yarn watch`

You also have to change `build.dev.js` to `build.dev.js?1` where the part after the `?` is always changing to avoid the cache. This is fixed in later versions (my contribution I think!) but we have to deal with it here.



## To Deploy to GitHub

```
# In the `packages/slate-react` directory
yarn prepublish

# if not logged into npm
npm login
npm publish
```