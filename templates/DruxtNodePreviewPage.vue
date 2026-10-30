<template>
  <div
    class="druxt-node-preview"
    :data-view-mode="viewMode"
    :data-entity-type="entity && entity.type"
    :data-entity-uuid="entity && entity.id"
  >
    <div v-if="error" class="druxt-node-preview-error">
      <h1>Preview unavailable</h1>
      <p>{{ error }}</p>
    </div>

    <DruxtNodePreview
      v-else-if="document"
      :key="entity.id"
      :document="document"
      :mode="viewMode"
    />

    <p v-else>Loading preview...</p>
  </div>
</template>

<script>
import DruxtNodePreview from './druxt-node-preview.vue'

/**
 * Renders a Drupal node preview.
 *
 * This page only works in the browser. The preview endpoint arrives in the
 * URL fragment, which never reaches the server, and the fetch uses the
 * editor's Drupal session cookie. A server render shows "Loading preview...".
 */
export default {
  name: 'DruxtNodePreviewPage',

  components: { DruxtNodePreview },

  /**
   * The layout named by `?layout=`, when the `layouts` option lists it.
   *
   * @param {object} context - The Nuxt context.
   *
   * @returns {string|undefined} The layout, or undefined for the default.
   */
  layout: ({ $druxtNodePreview, route }) =>
    $druxtNodePreview.layout(route.query.layout),

  data: () => ({
    document: null,
    entity: null,
    error: null,
  }),

  computed: {
    // The view mode comes from the query, which any link can set, so only a
    // machine name is used.
    viewMode() {
      const { vm } = this.$route.query
      return typeof vm === 'string' && /^[A-Za-z0-9_]+$/.test(vm) ? vm : 'full'
    },
  },

  async mounted() {
    // A statically generated site renders this page once, with no query, and
    // Nuxt keeps that layout in the browser. So the listed layout is set here
    // as well, where the query is known.
    const layout = this.$druxtNodePreview.layout(this.$route.query.layout)
    if (layout && this.$nuxt && this.$nuxt.layoutName !== layout) {
      const previous = this.$nuxt.layoutName
      // A layout chunk can fail to download. Then the preview shows in the
      // layout the page already has. Webpack names that a ChunkLoadError, or
      // says "Loading chunk" in the message. Any other error is a fault in
      // the layout, so it goes to the console too.
      const report = (error) => {
        if (
          !/chunk/i.test(`${error && error.name} ${error && error.message}`)
        ) {
          console.error('DruxtNodePreview could not load the layout:', error)
        }
      }
      const state = this.$nuxt.nuxt || {}
      const before = state.err
      try {
        await this.$nuxt.loadLayout(layout)
        if (state.err && state.err !== before) {
          // Nuxt 2 does not reject a failed layout. It calls error() and
          // resolves, and its error page would replace the preview. So the
          // error is cleared. Nuxt's error handler can still change the
          // layout, so the page waits for it before the check below.
          report(state.err)
          this.$nuxt.error(null)
          await new Promise((done) => setTimeout(done))
        } else {
          this.$nuxt.setLayout(layout)
        }
      } catch (error) {
        report(error)
      }
      // A new layout mounts a new page, which loads the preview. If this one
      // loaded it too, the two would seed the same document twice. Nuxt falls
      // back to the default layout for one the site does not have, and then
      // nothing new mounts, so this page loads the preview itself.
      if (this.$nuxt.layoutName !== previous) return
    }

    return this.load()
  },

  // A site can keep pages alive. Leaving the preview flushes the seeded
  // resources, so a page that comes back loads its preview again. Vue also
  // calls activated after the first mount, and that call loads nothing.
  activated() {
    if (!this.left) return
    this.left = false
    return this.load()
  },

  deactivated() {
    this.left = true
  },

  beforeDestroy() {
    this.gone = true
  },

  methods: {
    /**
     * Fetches the preview and seeds the Druxt store with it.
     */
    async load() {
      this.run = (this.run || 0) + 1
      const run = this.run
      // A reload starts clean. The old preview's resources are flushed, and
      // an old error would hide a preview that now loads.
      this.document = null
      this.entity = null
      this.error = null
      try {
        const endpoint = this.$druxtNodePreview.endpoint()
        if (!endpoint) {
          this.error = 'The URL fragment has no preview endpoint.'
          return
        }
        const document = await this.$druxtNodePreview.fetch(endpoint)
        // The editor can open another preview before this fetch ends. A page
        // that is gone, kept alive or loading again seeds nothing, so this
        // document cannot replace a newer one.
        if (this.gone || this.left || run !== this.run) return
        // seed() returns null once the editor is leaving. This page can still
        // be mounted then, and a document without an entity would not render.
        const entity = this.$druxtNodePreview.seed(document)
        if (!entity) return
        this.entity = entity
        this.document = document
      } catch (error) {
        if (run === this.run) this.error = error.message
      }
    },
  },
}
</script>
