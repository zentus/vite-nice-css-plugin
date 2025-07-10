# @zentus/vite-nice-css-plugin

## Installation

`npm install @zentus/vite-nice-css-plugin`

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