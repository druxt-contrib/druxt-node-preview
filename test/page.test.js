import Page from '../templates/DruxtNodePreviewPage.vue'

// A fake page that has the component's methods, so the hooks can call them.
const withMethods = (page) => Object.assign(page, Page.methods)

describe('DruxtNodePreviewPage', () => {
  test('mounted shows nothing when the editor leaves during the fetch', async () => {
    // seed() returns null once the editor is leaving, while this page is
    // still mounted. A document without an entity would not render.
    const page = withMethods({
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
    })
    await Page.mounted.call(page)
    expect(page.$druxtNodePreview.seed).toHaveBeenCalled()
    expect(page.document).toBeNull()
    expect(page.entity).toBeNull()
    expect(page.error).toBeNull()
  })

  test('mounted seeds nothing once the page is gone', async () => {
    // The editor can leave this preview and open another before the first
    // fetch ends. The first document must not reach the second preview.
    let resolve
    const page = withMethods({
      $druxtNodePreview: {
        layout: jest.fn(() => undefined),
        endpoint: () => '/jsonapi/node/page/uuid/preview',
        fetch: jest.fn(() => new Promise((done) => { resolve = done })),
        seed: jest.fn(() => ({ type: 'node--page', id: 'uuid' })),
      },
      $route: { query: {} },
      document: null,
      entity: null,
      error: null,
    })
    const mounted = Page.mounted.call(page)
    Page.beforeDestroy.call(page)
    resolve({ data: { type: 'node--page', id: 'uuid' } })
    await mounted
    expect(page.$druxtNodePreview.seed).not.toHaveBeenCalled()
    expect(page.entity).toBeNull()
  })

  test('activated loads the preview again after the page was kept alive', async () => {
    // A site can keep pages alive. Leaving the preview flushes the seeded
    // resources, so a page that comes back must seed them again.
    const page = withMethods({
      $druxtNodePreview: {
        layout: jest.fn(() => undefined),
        endpoint: () => '/jsonapi/node/page/uuid/preview',
        fetch: jest.fn().mockResolvedValue({ data: { type: 'node--page', id: 'uuid' } }),
        seed: jest.fn(() => ({ type: 'node--page', id: 'uuid' })),
      },
      $route: { query: {} },
      document: null,
      entity: null,
      error: null,
    })
    await Page.mounted.call(page)
    // Vue also calls activated after the first mount. That one loads nothing.
    await Page.activated.call(page)
    expect(page.$druxtNodePreview.fetch).toHaveBeenCalledTimes(1)

    Page.deactivated.call(page)
    await Page.activated.call(page)
    expect(page.$druxtNodePreview.fetch).toHaveBeenCalledTimes(2)
    expect(page.$druxtNodePreview.seed).toHaveBeenCalledTimes(2)
    expect(page.entity).toEqual({ type: 'node--page', id: 'uuid' })
  })

  test('a fetch that ends after the page is kept alive seeds nothing', async () => {
    let resolve
    const page = withMethods({
      $druxtNodePreview: {
        layout: jest.fn(() => undefined),
        endpoint: () => '/jsonapi/node/page/uuid/preview',
        fetch: jest.fn(() => new Promise((done) => { resolve = done })),
        seed: jest.fn(() => ({ type: 'node--page', id: 'uuid' })),
      },
      $route: { query: {} },
      document: null,
      entity: null,
      error: null,
    })
    const mounted = Page.mounted.call(page)
    Page.deactivated.call(page)
    resolve({ data: { type: 'node--page', id: 'uuid' } })
    await mounted
    expect(page.$druxtNodePreview.seed).not.toHaveBeenCalled()
    expect(page.entity).toBeNull()
  })

  test('a reload clears the error a failed load left', async () => {
    const page = withMethods({
      $druxtNodePreview: {
        layout: jest.fn(() => undefined),
        endpoint: () => '/jsonapi/node/page/uuid/preview',
        fetch: jest.fn()
          .mockRejectedValueOnce(new Error('HTTP 502'))
          .mockResolvedValue({ data: { type: 'node--page', id: 'uuid' } }),
        seed: jest.fn(() => ({ type: 'node--page', id: 'uuid' })),
      },
      $route: { query: {} },
      document: null,
      entity: null,
      error: null,
    })
    await Page.mounted.call(page)
    expect(page.error).toBe('HTTP 502')
    Page.deactivated.call(page)
    await Page.activated.call(page)
    expect(page.error).toBeNull()
    expect(page.entity).toEqual({ type: 'node--page', id: 'uuid' })
  })

  test('a reload shows nothing old while the new fetch runs', async () => {
    // Leaving flushed the seeded resources, so the old preview must not
    // render while the page loads it again.
    let resolve
    const page = withMethods({
      $druxtNodePreview: {
        layout: jest.fn(() => undefined),
        endpoint: () => '/jsonapi/node/page/uuid/preview',
        fetch: jest.fn()
          .mockResolvedValueOnce({ data: { type: 'node--page', id: 'uuid' } })
          .mockImplementation(() => new Promise((done) => { resolve = done })),
        seed: jest.fn(() => ({ type: 'node--page', id: 'uuid' })),
      },
      $route: { query: {} },
      document: null,
      entity: null,
      error: null,
    })
    await Page.mounted.call(page)
    expect(page.document).not.toBeNull()
    Page.deactivated.call(page)
    const reload = Page.activated.call(page)
    expect(page.document).toBeNull()
    expect(page.entity).toBeNull()
    resolve({ data: { type: 'node--page', id: 'uuid' } })
    await reload
    expect(page.entity).toEqual({ type: 'node--page', id: 'uuid' })
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
