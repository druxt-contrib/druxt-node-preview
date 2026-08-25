<?php

/**
 * @file
 * Prepares the e2e Drupal site.
 *
 * Run with: drush php:script setup.php -- <frontend_a_url> <frontend_b_url>
 * Creates the content model, a test article with two paragraphs, and a
 * consumer with one preview target per frontend.
 */

use Drupal\consumers\Entity\Consumer;
use Drupal\Core\Field\FieldStorageDefinitionInterface;
use Drupal\field\Entity\FieldConfig;
use Drupal\field\Entity\FieldStorageConfig;
use Drupal\node\Entity\Node;
use Drupal\node\Entity\NodeType;
use Drupal\paragraphs\Entity\Paragraph;
use Drupal\paragraphs\Entity\ParagraphsType;

[$front_a, $front_b] = $extra;

// A dedicated type: the standard profile's article carries fields (like the
// image field) whose widgets are not needed here and only add failure modes.
if (!NodeType::load('e2e_article')) {
  NodeType::create(['type' => 'e2e_article', 'name' => 'E2E Article', 'new_revision' => TRUE, 'preview_mode' => DRUPAL_OPTIONAL])->save();
}
if (!ParagraphsType::load('text')) {
  ParagraphsType::create(['id' => 'text', 'label' => 'Text'])->save();
}
if (!FieldStorageConfig::loadByName('paragraph', 'field_text')) {
  FieldStorageConfig::create(['field_name' => 'field_text', 'entity_type' => 'paragraph', 'type' => 'string'])->save();
}
if (!FieldConfig::loadByName('paragraph', 'text', 'field_text')) {
  FieldConfig::create(['field_name' => 'field_text', 'entity_type' => 'paragraph', 'bundle' => 'text', 'label' => 'Text'])->save();
}
if (!FieldStorageConfig::loadByName('node', 'field_body')) {
  FieldStorageConfig::create([
    'field_name' => 'field_body', 'entity_type' => 'node', 'type' => 'entity_reference_revisions',
    'settings' => ['target_type' => 'paragraph'], 'cardinality' => FieldStorageDefinitionInterface::CARDINALITY_UNLIMITED,
  ])->save();
}
if (!FieldConfig::loadByName('node', 'e2e_article', 'field_body')) {
  FieldConfig::create([
    'field_name' => 'field_body', 'entity_type' => 'node', 'bundle' => 'e2e_article', 'label' => 'Body paragraphs',
    'settings' => ['handler' => 'default:paragraph', 'handler_settings' => ['target_bundles' => ['text' => 'text']]],
  ])->save();
}
$displays = \Drupal::service('entity_display.repository');
$displays->getFormDisplay('paragraph', 'text')->setComponent('field_text', ['type' => 'string_textfield'])->save();
$displays->getViewDisplay('paragraph', 'text')->setComponent('field_text', ['type' => 'string', 'label' => 'hidden'])->save();
$displays->getFormDisplay('node', 'e2e_article')->setComponent('field_body', ['type' => 'paragraphs', 'weight' => 10])->save();
$displays->getViewDisplay('node', 'e2e_article')->setComponent('field_body', [
  'type' => 'entity_reference_revisions_entity_view', 'label' => 'hidden', 'weight' => 10,
])->save();
// A second view display, so the preview bar shows the view mode selector.
$displays->getViewDisplay('node', 'e2e_article', 'teaser')->setComponent('field_body', [
  'type' => 'entity_reference_revisions_entity_view', 'label' => 'hidden', 'weight' => 10,
])->save();

$consumers = \Drupal::entityTypeManager()->getStorage('consumer')->loadByProperties(['client_id' => 'e2e_frontends']);
$consumer = $consumers ? reset($consumers) : NULL;
if (!$consumer) {
  $consumer = Consumer::create(['client_id' => 'e2e_frontends', 'label' => 'E2E Frontends', 'owner_id' => 1]);
}
$consumer->set('preview_targets', [
  ['label' => 'Druxt', 'url' => $front_a . '/druxt/node/preview?vm=[view_mode]#[jsonapi_node_preview]'],
  ['label' => 'Static', 'url' => $front_b . '/?vm=[view_mode]#[jsonapi_node_preview]'],
]);
$consumer->save();

$nodes = \Drupal::entityTypeManager()->getStorage('node')->loadByProperties(['title' => 'E2E Preview test']);
if (!$nodes) {
  $alpha = Paragraph::create(['type' => 'text', 'field_text' => 'Alpha (saved)']);
  $alpha->save();
  $beta = Paragraph::create(['type' => 'text', 'field_text' => 'Beta (saved)']);
  $beta->save();
  $node = Node::create(['type' => 'e2e_article', 'title' => 'E2E Preview test', 'status' => 1, 'uid' => 1, 'field_body' => [$alpha, $beta]]);
  $node->save();
}
else {
  $node = reset($nodes);
}
print "NODE_ID=" . $node->id() . "\n";
print "CONSUMER_UUID=" . $consumer->uuid() . "\n";
