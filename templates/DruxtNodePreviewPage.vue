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

  async mounted() {
    try {
      const endpoint = this.$druxtNodePreview.endpoint()
      if (!endpoint) {
        this.error = 'No preview endpoint was provided in the URL fragment.'
        return
      }
      const document = await this.$druxtNodePreview.fetch(endpoint)
      // seed() returns null once the editor is leaving. This page can still
      // be mounted then, and a document without an entity would not render.
      const entity = this.$druxtNodePreview.seed(document)
      if (!entity) return
      this.entity = entity
      this.document = document
    }
    catch (error) {
      this.error = error.message
    }
  },
}
</script>
