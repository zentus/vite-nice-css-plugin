# @zentus/vite-nice-css-plugin

## Installation

`npm install --save-dev @zentus/vite-nice-css-plugin`

## Usage

Add the plugin in your `vite.config.js`

```js
import react from '@vitejs/plugin-react'
import viteNiceCssPlugin from '@zentus/vite-nice-css-plugin'

export default defineConfig({
  plugins: [
    react(),
    viteNiceCssPlugin()
  ]
})
```

Import `bundle.css` in your `index.html`

```html
<head>
  <link rel="stylesheet" type="text/css" href="/bundle.css" />
</head>
```

Use it in your app like so

```jsx
const styles = {
  container: `
    display: flex;
  `
}

const MyComponent = () => {
  return <div className={styles.container}/>
}
```

If you want to lint "styles" objects, you can use `@zentus/eslint-plugin-vite-nice-css-plugin`

### Installation

`npm install --save-dev @zentus/eslint-plugin-vite-nice-css-plugin`

### Usage

Add the plugin to your `.eslintrc.js`

```js
module.exports = {
  plugins: ['@zentus/vite-nice-css-plugin'],
  rules: {
    '@zentus/vite-nice-css-plugin/css-template': 2
  }
}
```