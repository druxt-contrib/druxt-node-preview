# Layouts and theming

## Preview layouts

List the Nuxt layouts the preview may use in the `layouts` option:

```js
druxt: {
  nodePreview: {
    layouts: ['default', 'preview'],
  },
}
```

Then, on the consumer in Drupal, add one layout name in each **Preview
layouts** box. Put `default` first, because the preview opens in the first one.
Add `&layout=[layout]` to the target URL, before the `#`.

The page uses the layout that `?layout=` names, but only if `layouts` lists
it. If not, the page uses the default layout. A preview URL cannot pick any
other layout.

Each listed layout must be a file in the site's `layouts/` folder that renders
`<Nuxt />`. A bare layout suits content that sits inside other pages. It has
the site's type and spacing, but no header or footer.

A site that picks layouts somewhere else can call
`$druxtNodePreview.layout(name)`. It makes the same check.

## Theming the preview

A live page often adds a title or a container around the node. The preview
gets the same from a wrapper component, picked like any Druxt wrapper. For a
`node--doc_page` previewed in `full`, the page uses the first of these that
exists:

1. `DruxtNodePreviewDocPageFull`
2. `DruxtNodePreviewDocPage`
3. `DruxtNodePreviewDefault`

If none of them exists, the node renders in Druxt's plain wrapper.

A wrapper gets any of these props that it declares:

- `document`: the whole JSON:API preview document.
- `entity`: the previewed resource, with `attributes` such as the title.
- `mode`, `type` and `uuid`.

Its default slot renders the node with `DruxtEntity`:

```vue
<!-- components/druxt/node-preview/DocPageFull.vue -->
<template>
  <article class="prose">
    <h1>{{ entity.attributes.title }}</h1>
    <slot />
  </article>
</template>

<script>
export default {
  // The props it does not declare would otherwise land on <article>.
  inheritAttrs: false,
  props: {
    entity: { type: Object, required: true },
  },
}
</script>
```

A wrapper named by bundle alone, such as `DruxtNodePreviewDocPage`, applies to
every view mode. Put page parts such as a title in the `<Bundle>Full` wrapper,
as above, or check the `mode` prop.

## Components that fetch their own data

A component that reads the Druxt store shows the unsaved data. A component
that fetches its data again, such as paragraphs at a revision, shows the saved
content instead. Skip that fetch while a preview is active:

```js
if ((this.$store.state.druxtNodePreview || {}).active) return
```

When the editor leaves the preview, the module removes the preview data from
the store. The next page loads the saved content.

The module stores the data under the route's `langcode` meta. `DruxtEntity`
reads it there when it has no `langcode` prop.
