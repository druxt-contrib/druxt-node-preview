# Drupal setup for automatic registration

For [automatic registration](registration.md), the frontend gets a token from
Simple OAuth with the client credentials grant, so Drupal needs both set up.

## The consumer

Use the frontend's confidential consumer. One consumer can serve the
frontend's settings, its preview targets and this registration.

Do not use the public consumer that people sign in with, such as the one for
druxt-auth's password or authorization code flow. The client credentials grant
does not work with a public consumer.

A target that reads with a token also needs the **Authorization Code** grant,
and a scope of its own, on the same consumer. Steps 1 to 8 set up only the
registration. Then follow [Previews with a
token](preview-request.md#previews-with-a-token).

## Steps

1. Install [Simple OAuth](https://www.drupal.org/project/simple_oauth) 6.1 or
   later. Its JWT library needs PHP's `sodium` extension.

   ```sh
   composer require drupal/simple_oauth:^6.1
   drush en simple_oauth
   ```

   Simple OAuth adds required fields to every consumer. The existing
   consumers then fail validation until you edit them. Edit and save each
   one, and set its **Grant types**. The default consumer also needs an
   **Access token expiration time**, or it shows "This value should not be
   null". A recipe that imports a consumer needs these fields too.

2. Make Simple OAuth's keys in a folder of the site's own, outside the web
   root, and set their paths. The paths are also at **Administration >
   Configuration > People > Simple OAuth**. For a site whose web root is
   `/srv/example.com/web`:

   ```sh
   mkdir -p /srv/example.com/oauth-keys
   drush simple-oauth:generate-keys /srv/example.com/oauth-keys
   drush config:set simple_oauth.settings public_key /srv/example.com/oauth-keys/public.key -y
   drush config:set simple_oauth.settings private_key /srv/example.com/oauth-keys/private.key -y
   ```

3. Add a role, such as Preview target registrar. Give it the permission
   **Register node preview targets for own consumers**, and nothing else.
4. Add a user for the frontend, such as `frontend_registrar`, and give it
   that role. Nobody signs in as this user.
5. Add a scope at
   **Administration > Configuration > People > Simple OAuth > Scopes**. Turn
   on its **Client Credentials** grant type.
   <!-- vale ai-tells.OverusedVocabulary = NO -->
   <!-- Granularity is the name of the field in Simple OAuth's scope form. -->
   Under **Granularity**, pick **Role**, and then the role from step 3.
   <!-- vale ai-tells.OverusedVocabulary = YES -->
6. Edit the frontend's consumer:
   - Set a **Secret**, and keep **Is Confidential?** on.
   - Under **Grant types**, turn on **Client Credentials**. For a target that
     reads with a token, keep **Authorization Code** on as well.
   - Under **Client Credentials settings**, set **User** to the user from
     step 4. The token acts as this user.
   - In the **Scopes** under **Client Credentials settings**, pick the scope
     from step 5.
7. Make the user from step 4 the consumer's owner. Consumer Node Preview
   lets a user change only the targets of a consumer it owns. If the current
   owner changes the targets through that permission, it can't once the owner
   changes, so check first how that user will manage them. The consumer form
   has no owner field, so use Drush. Replace `frontend` with the consumer's
   client ID, and `frontend_registrar` with the user name from step 4:

   ```sh
   drush php:eval '$c = \Drupal::entityTypeManager()->getStorage("consumer")->loadByProperties(["client_id" => "frontend"]); $u = user_load_by_name("frontend_registrar"); reset($c)->setOwnerId($u->id())->save();'
   ```

   A recipe can set the owner in the consumer's default content instead, as
   the [example's
   recipe](https://github.com/druxt-contrib/druxt-node-preview/tree/0.x/example/drupal/recipes/druxt_node_preview_example)
   does.

8. Set `DRUXT_NODE_PREVIEW_CLIENT_SECRET` to the consumer's secret where Nuxt
   runs. Then start Nuxt. The build output says that it registered the
   target.

Registration doesn't need CORS settings, but the preview page still needs the
[Quick start](../README.md#quick-start) steps for CORS and the frame.

If Consumer Node Preview limits the hosts a target can use, add the
frontend's host to **Allowed target hosts** on its **Preview** tab.
