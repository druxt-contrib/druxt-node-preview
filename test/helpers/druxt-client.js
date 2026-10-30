/**
 * Routes every request of a mocked DruxtClient to a jest mock.
 *
 * The client is a real DruxtClient, so its options and its axios instance are
 * real. Only the axios request is replaced. The mock gets the method, the URL
 * and the headers and body, and answers with a status and a body text.
 *
 * @param {Function} DruxtClient - The mocked DruxtClient constructor.
 * @param {Function} request - The mock that answers each request.
 *
 * @returns {object[]} The clients made, in order.
 */
export const routeDruxtClient = (DruxtClient, request) => {
  const { DruxtClient: Actual } = jest.requireActual('druxt')
  const clients = []
  DruxtClient.mockImplementation((...args) => {
    const client = new Actual(...args)
    client.axios.request = jest.fn(async (config) => {
      const { data } = config
      const body =
        data === undefined || typeof data === 'string'
          ? data
          : JSON.stringify(data)
      const response = await request(config.method, config.url, {
        headers: config.headers,
        body,
        config,
      })
      return (
        response && {
          status: response.status,
          data: response.text,
          headers: response.headers || {},
        }
      )
    })
    clients.push(client)
    return client
  })
  return clients
}
