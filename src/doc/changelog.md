## v1.0.6

- Update deprecated IdM authentication headers by the current ones.
- Upgraded to marked v0.3.6

## v1.0.5

- Update to CKAN 2.4.x
- Bugfixes:

    - Error changing preferences. [#1](https://github.com/wirecloud-fiware/ckan-resource-selector-widget/issues/1)
    - Initial code for reporting connection errors. [#2](https://github.com/wirecloud-fiware/ckan-resource-selector-widget/issues/2)

## v1.0.4

- Fix some bugs that made the widget not working
- Add metadata to the data sent via wiring
- Now the cursor is a pointer in every field and you can click in the full field, not only the name

## v1.0.3

- Use the FIWARE Lab's instance of CKAN by default
- Added support for IdM authentication using WireCloud's credentials
- Refactored user interface
- Initial support for filtering datasets using the query language supported by
  CKAN (based in the lucene syntax). Users can introduce those queries using an
  input box being the default behaviour searching by keyword (so users don't
  need to know the lucene sintax). Tag labels can be used for filtering datasets
  by the associated tag.

## v1.0.2

- Added this changelog

## v1.0.1

- Improved widget's metadata

## v1.0.0

Initial ckan-resource-selector widget release.
