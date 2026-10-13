import Page from '../templates/DruxtNodePreviewPage.vue'

describe('DruxtNodePreviewPage', () => {
  test('mounted shows nothing when the editor leaves during the fetch', async () => {
    // seed() returns null once the editor is leaving, while this page is
    // still mounted. A document without an entity would not render.
    const page = {
      $druxtNodePreview: {
        layout: jest.fn(() => undefined),
        endpoint: () => '/jsonapi/node/page/uuid/preview',
        fetch: jest.fn().mockResolvedValue({ data: { type: 'node--page', id: 'uuid' } }),
        seed: jest.fn(() => null),
      },
      $route: { query: {} },
      document: null,
      entity: null,
      error: null,
    }
    await Page.mounted.call(page)
    expect(page.$druxtNodePreview.seed).toHaveBeenCalled()
    expect(page.document).toBeNull()
    expect(page.entity).toBeNull()
    expect(page.error).toBeNull()
  })

  // The view mode comes from the query, which any link can set. A list, or a
  // name that is not a machine name, gives the default.
  test('viewMode takes only a machine name from ?vm=', () => {
    const viewMode = (vm) => Page.computed.viewMode.call({ $route: { query: { vm } } })
    expect(viewMode('teaser')).toBe('teaser')
    expect(viewMode(undefined)).toBe('full')
    expect(viewMode(['teaser', 'full'])).toBe('full')
    expect(viewMode('teaser"><img src=x>')).toBe('full')
    expect(viewMode('')).toBe('full')
  })
})
