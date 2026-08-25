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

    <DruxtEntity
      v-else-if="entity"
      :key="entity.id"
      :mode="viewMode"
      :type="entity.type"
      :uuid="entity.id"
    />

    <p v-else>
      Loading preview…
    </p>
  </div>
</template>

<script>
/**
 * Renders a Drupal node preview.
 *
 * This page only works in the browser. The preview endpoint arrives in the
 * URL fragment, which never reaches the server, and the fetch uses the
 * editor's Drupal session cookie.
 */
export default {
  name: 'DruxtNodePreviewPage',

  data: () => ({
    entity: null,
    error: null,
  }),

  computed: {
    viewMode() {
      return this.$route.query.vm || 'full'
    },
  },

  async mounted() {
    const endpoint = this.$druxtNodePreview.endpoint()
    if (!endpoint) {
      this.error = 'No preview endpoint was provided in the URL fragment.'
      return
    }
    try {
      const doc = await this.$druxtNodePreview.fetch(endpoint)
      this.entity = this.$druxtNodePreview.seed(doc)
    }
    catch (error) {
      this.error = error.message
    }
  },
}
</script>
