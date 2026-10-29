<template>
  <div
    class="druxt-node-preview"
    :data-view-mode="viewMode"
    :data-entity-type="entity && entity.type"
    :data-entity-uuid="entity && entity.id"
  >
    <div
      v-if="error"
      class="druxt-node-preview-error"
    >
      <h1>Preview unavailable</h1>
      <p>{{ error }}</p>
    </div>

    <DruxtNodePreview
      v-else-if="document"
      :key="entity.id"
      :document="document"
      :mode="viewMode"
    />

    <p v-else>
      Loading preview...
    </p>
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

  mounted() {
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
          this.error = 'No preview endpoint was provided in the URL fragment.'
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
      }
      catch (error) {
        if (run === this.run) this.error = error.message
      }
    },
  },
}
</script>
