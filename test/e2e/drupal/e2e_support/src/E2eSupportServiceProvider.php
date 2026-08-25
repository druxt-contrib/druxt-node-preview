<?php

declare(strict_types=1);

namespace Drupal\e2e_support;

use Drupal\Core\DependencyInjection\ContainerBuilder;
use Drupal\Core\DependencyInjection\ServiceProviderBase;

/**
 * Workarounds for known conflicts in the e2e stack.
 */
class E2eSupportServiceProvider extends ServiceProviderBase {

  /**
   * {@inheritdoc}
   *
   * jsonapi_resources decorates jsonapi.include_resolver. The decorator does
   * not forward the extra preview argument that jsonapi_node_preview's
   * resolver needs, so previews silently serve saved data. This stack does
   * not use jsonapi_resources' custom routes, so drop the decorator. The
   * conflict is reported upstream.
   */
  public function alter(ContainerBuilder $container): void {
    if ($container->hasDefinition('jsonapi_resources.include_resolver')) {
      $container->removeDefinition('jsonapi_resources.include_resolver');
    }
  }

}
