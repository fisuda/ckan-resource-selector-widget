/*
 * Copyright (c) 2014-2016 CoNWeT Lab., Universidad Politécnica de Madrid
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* globals marked, MashupPlatform, StyledElements */

window.Widget = (function (se) {

    'use strict';

    var builder = new se.GUIBuilder();
    var DATASET_TEMPLATE = builder.DEFAULT_OPENING + '<div class="panel panel-default"><div class="panel-heading"><h4 class="panel-title"><t:link/><t:accesslabel/></h4></div><t:avatar/><t:description/><div class="panel-footer"><t:tags/></div></div>' + builder.DEFAULT_CLOSING;
    var RESOURCE_TEMPLATE = builder.DEFAULT_OPENING + '<div class="panel panel-default"><div class="panel-heading"><h4 class="panel-title"><t:format/><t:title/></h4></div><t:description/></div>' + builder.DEFAULT_CLOSING;

    /**
     * Create a new instance of class Widget.
     * @class
     */
    var Widget = function Widget() {
        this.ckan_dataset_source = null;
        this.textInput = null;
        this.layout = null;
        this.notebook = null;
        this.dataset_tab = null;
        this.dataset_tab_content = null;
        this.resource_tab = null;
        this.resource_tab_title = null;
        this.resource_tab_content = null;
        this.selected_dataset = null;
        this.selected_resource = null;
        this.connection_info = null;
        this.pagination = null;

        this.error_element = null;
        this.warn_element = null;

        this.MAX_ROWS = 20;
        this.MP = MashupPlatform;

        // CKAN types must be transformed in JS types
        // to be used across the different widgets
        this.TYPE_MAPPING = {
            'text': 'string',
            'numeric': 'number',
            'int4': 'number',
            'timestamp': 'date'
        };

        MashupPlatform.prefs.registerCallback(prefHandler.bind(this));

        MashupPlatform.widget.context.registerCallback(function (changes) {
            if ('widthInPixels' in changes || 'heightInPixels' in changes) {
                this.layout.repaint();
            }
        }.bind(this));
    };

    /* ==================================================================================
     *  PUBLIC METHODS
     * ================================================================================== */

    Widget.prototype.init = function init() {

        var markdown_renderer = new marked.Renderer();
        markdown_renderer.link = function (href, title, text) {
            if (this.options.sanitize) {
                var prot = href.trim();
                if (prot.indexOf("javascript:") === 0) {
                    return "";
                }
            }

            var out = '<a href="' + href + '"';
            if (title) {
                out += ' title="' + title + '"';
            }
            out += 'target="_blank"> ' + text + '</a>';
            return out;
        };
        marked.setOptions({
            xhtml: true,
            renderer: markdown_renderer
        });

        this.layout = new se.VerticalLayout();
        this.layout.insertInto(document.body);

        this.notebook = new se.Notebook();
        this.layout.center.appendChild(this.notebook);

        this.dataset_tab = this.notebook.createTab({name: "Dataset", closable: false});
        var dataset_tab_layout = new se.VerticalLayout();
        this.dataset_tab.appendChild(dataset_tab_layout);
        this.dataset_tab_content = dataset_tab_layout.center;
        this.dataset_tab_content.addClassName('container-content');

        /*
        // Update Button
        var updateButton = new se.Button({"class": "icon-refresh", plain: true});
        updateButton.addEventListener('click', loadInitialDataSets.bind(this));
        updateButton.insertInto(title);
        */

        this.ckan_dataset_source = new se.PaginatedSource({
            'pageSize': this.MAX_ROWS,
            'order_by': '-creation_date',
            'keywords': '',
            'scope': 'all',
            'requestFunc': function (page, options, onSuccess, onError) {
                var start = (page - 1) * this.MAX_ROWS;
                make_request.call(this, this.MP.prefs.get('ckan_server') + '/api/3/action/package_search',
                                  process_dataset_search_response.bind(null, onSuccess, onError, page), onError, null, {rows: this.MAX_ROWS, start: start, q: options.keywords});
            }.bind(this),
            'processFunc': render_datasets.bind(this)
        });
        this.ckan_dataset_source.addEventListener('optionsChanged', function (source, options) {
            this.textInput.setValue(options.keywords);
        }.bind(this));

        this.ckan_dataset_source.addEventListener('requestStart', function () {
            clear_resource_tab.call(this);
            this.dataset_tab.disable();
        }.bind(this));
        this.ckan_dataset_source.addEventListener('requestEnd', function (source, error) {
            if (error != null) {
                showError.call(this, this.dataset_tab_content, error);
            }
            this.dataset_tab.enable();
        }.bind(this));

        // Add search input
        dataset_tab_layout.north.appendChild(create_search_input.call(this));

        // Add dataset pagination
        this.pagination = new se.PaginationInterface(this.ckan_dataset_source, {
            layout: builder.DEFAULT_OPENING + '<div class="se-input-group"><t:firstBtn/><t:prevBtn/><div class="box se-box">Page: <t:currentPage/>/<t:totalPages/></div><t:nextBtn/><t:lastBtn/></div> <strong><t:totalCount/> datasets found</strong>' + builder.DEFAULT_CLOSING
        });
        dataset_tab_layout.south.appendChild(this.pagination);

        this.resource_tab = this.notebook.createTab({name: "Resource", closable: false});
        var resource_tab_layout = new se.VerticalLayout();
        this.resource_tab.appendChild(resource_tab_layout);
        this.resource_tab_title = resource_tab_layout.north;
        this.resource_tab_title.addClassName('container-content');
        this.resource_tab_content = resource_tab_layout.center;
        this.resource_tab_content.addClassName('container-content');

        // Create the bottom information info
        this.connection_info = this.layout.south;
        this.layout.south.addClassName('container-content');

        // Initial load
        set_connected_to.call(this);
        loadInitialDataSets.call(this);

        // Initial repaint
        this.layout.repaint();

        /*
        MashupPlatform.widget.context.registerCallback(function (changes) {
            if ('widthInPixels' in changes || 'heightInPixels' in changes) {
                this.layout.repaint();
            }
        });
        */
    };

    /* ==================================================================================
     *  PRIVATE METHODS
     * ================================================================================== */

    var make_request = function make_request(url, onSuccess, onFailure, onComplete, parameters) {

        var headers = {};

        var auth_token = this.MP.prefs.get('auth_token').trim();
        if (auth_token !== '') {
            headers = {
                'Authentication': auth_token
            };
        } else if (MashupPlatform.context.get('fiware_token_available')) {
            headers = {
                'X-FIWARE-OAuth-Token': 'true',
                'X-FIWARE-OAuth-Header-Name': 'X-Auth-Token'
            };
        }

        MashupPlatform.http.makeRequest(url, {
            method: 'GET',
            requestHeaders: headers,
            parameters: parameters,
            onSuccess: onSuccess,
            onFailure: onFailure,
            onComplete: onComplete
        });
    };

    var set_connected_to = function set_connected_to() {
        this.connection_info.clear();
        this.connection_info.appendChild(document.createTextNode('CKAN Server: ' + this.MP.prefs.get('ckan_server')));
        this.layout.repaint();
    };

    var prefHandler = function prefHandler(preferences) {
        loadInitialDataSets.call(this);
        set_connected_to.call(this);
    };

    var datasetSelectChange = function datasetSelectChange() {
        hideErrorAndWarn();                     // Hide error message
        this.resource_tab_title.clear();
        this.resource_tab_title.appendChild(document.createTextNode('Resources available on the '));
        var strong = document.createElement('strong');
        strong.textContent = this.selected_dataset.title;
        this.resource_tab_title.appendChild(strong);
        this.resource_tab_title.appendChild(document.createTextNode(' dataset'));

        this.resource_tab.repaint();
        this.resource_tab.disable();
        make_request.call(this, this.MP.prefs.get('ckan_server') + '/api/action/package_show', render_resources.bind(this), showError.bind(this, this.resource_tab_content), this.resource_tab.enable.bind(this.resource_tab), {id: this.selected_dataset.id});
    };

    var resourceSelectChange = function resourceSelectChange() {
        hideErrorAndWarn();  // Hide error message
        make_request.call(this, this.MP.prefs.get('ckan_server') + '/api/action/datastore_search', pushResourceData.bind(this), showFloatingError.bind(this), null, {limit: this.MP.prefs.get('limit_rows'), resource_id: this.selected_resource.id});
    };


    var pushResourceData = function pushResourceData(response) {

        var resource = JSON.parse(response.responseText);

        if (resource.success) {

            var finalData = {
                structure: resource.result.fields,
                data: resource.result.records,
                metadata: this.selected_resource
            };

            finalData.metadata.ckan_server = MashupPlatform.prefs.get("ckan_server");

            // Type transformation
            for (var i = 0; i < finalData.structure.length; i++) {
                if (finalData.structure[i].type in this.TYPE_MAPPING) {
                    finalData.structure[i].type = this.TYPE_MAPPING[finalData.structure[i].type];
                }
            }

            // Push the data through the wiring
            MashupPlatform.wiring.pushEvent('resource', JSON.stringify(finalData));

            // Show warn message if limit_rows < resource elements
            var resource_total = resource.result.total;
            if (resource_total > this.MP.prefs.get('limit_rows')) {
                showWarn('<strong>WARNING:</strong> The number of records of the resource is higher ' +
                        'that the max number of elements to retrieve. If you want to see all the records, ' +
                        'increase the max number of elements to retrieve by editing the widget settings. ' +
                        '<br/>Current Value: ' + this.MP.prefs.get('limit_rows') + ' - Resource elements: ' + resource_total);
            }

        } else {
            showError.call(this, this.dataset_tab_content, "Unexpected response from CKAN");
        }
    };

    var dataset_item_click_builder = function dataset_item_click_builder(dataset) {
        return function () {
            this.selected_dataset = dataset;
            datasetSelectChange.call(this);
            this.notebook.goToTab(this.resource_tab);
        }.bind(this);
    };

    var process_dataset_search_response = function process_dataset_search_response(onSuccess, onFailure, page, response) {
        var raw_data = JSON.parse(response.responseText);
        var search_info = {
            'resources': raw_data.result.results,
            'current_page': page,
            'total_count': parseInt(raw_data.result.count, 10)
        };
        onSuccess(search_info.resources, search_info);
    };

    var escapeRegExp = function escapeRegExp(string) {
        return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
    };

    var replaceAll = function replaceAll(string, find, replace) {
        return string.replace(new RegExp(escapeRegExp(find), 'g'), replace);
    };

    var render_datasets = function render_datasets(datasets) {
        var dataset, entry;
        this.dataset_tab_content.clear();
        for (var i = 0; i < datasets.length; i++) {
            dataset = datasets[i];

            entry = builder.parse(DATASET_TEMPLATE, {
                accesslabel: function () {
                    if (dataset.private) {
                        var accesslabel = document.createElement('span');
                        accesslabel.className = 'label';
                        if ('resources' in dataset) {
                            accesslabel.classList.add('label-info');
                            accesslabel.textContent = 'ADQUIRED';
                        } else if (typeof dataset.acquire_url === 'string' && dataset.acquire_url != '') {
                            accesslabel.classList.add('label-inverse');
                            accesslabel.textContent = 'ADQUIRE';
                        } else {
                            accesslabel.classList.add('label-inverse');
                            accesslabel.textContent = 'PRIVATE';
                        }
                        return accesslabel;
                    }
                },
                avatar: function () {
                    if (dataset.organization != null) {
                        var avatar = document.createElement('img');
                        avatar.className = "panel-body";
                        avatar.src = new URL(dataset.organization.image_url, new URL('uploads/group/', this.MP.prefs.get('ckan_server')));
                        avatar.addEventListener('click', filter_by_org.bind(this, dataset.organization.name), false);
                        return avatar;
                    }
                }.bind(this),
                description: function () {
                    var description = document.createElement('article');
                    description.className = 'panel-body';
                    if (dataset.notes) {
                        description.innerHTML = marked(dataset.notes);
                    } else {
                        description.textContent = "No description provided";
                    }
                    return description;
                },
                link: function () {
                    var header_link;

                    if (dataset.private && !('resources' in dataset)) {
                        header_link = document.createElement('span');
                    } else {
                        header_link = document.createElement('a');
                        header_link.setAttribute('role', 'button');
                        header_link.setAttribute('tabindex', '0');
                    }
                    header_link.textContent = dataset.title;
                    return header_link;
                },
                tags: function () {
                    var tags = dataset.tags.map(function (tag) {
                        var element = document.createElement('span');
                        element.className = 'label label-success';
                        element.textContent = tag.display_name;
                        element.addEventListener('click', filter_by_tag.bind(this, tag.name), false);
                        return element;
                    }.bind(this));
                    return new se.Fragment(tags);
                }.bind(this)
            }).elements[0];

            if (dataset.private && !('resources' in dataset)) {
                entry.classList.add('disabled');
            } else {
                entry.addEventListener('click', dataset_item_click_builder.call(this, dataset), false);
            }

            this.dataset_tab_content.appendChild(entry);
        }
    };

    var filter_by = function filter_by(query, event) {
        event.stopPropagation();

        var keywords = this.textInput.value.trim();
        if (keywords === '') {
            keywords = query;
            this.ckan_dataset_source.changeOptions({keywords: keywords});
        } else if (keywords.indexOf(query) === -1) {
            keywords = query + " " + keywords;
            this.ckan_dataset_source.changeOptions({keywords: keywords});
        }
    };

    var filter_by_org = function filter_by_org(name, event) {
        var query = "organization:" + replaceAll(name, " ", "\\ ");
        filter_by.call(this, query, event);
    };

    var filter_by_tag = function filter_by_tag(name, event) {
        var query = "tags:" + replaceAll(name, " ", "\\ ");
        filter_by.call(this, query, event);
    };

    var resource_item_click_builder = function resource_item_click_builder(resource) {
        return function () {
            this.selected_resource = resource;
            resourceSelectChange.call(this);
        }.bind(this);
    };

    var render_resources = function render_resources(response) {
        var dataset = JSON.parse(response.responseText);
        var resources = dataset.result.resources;

        this.resource_tab_content.clear();
        resources.forEach(function (resource) {
            var entry;
            var entry = builder.parse(RESOURCE_TEMPLATE, {
                description: function () {
                    if (resource.description) {
                        var description = document.createElement('article');
                        description.className = 'panel-body';
                        description.innerHTML = marked(resource.description);
                        return description;
                    }
                },
                format: function () {
                    var format = document.createElement('span');
                    format.className = 'label label-info';
                    format.textContent = resource.format;
                    return format;
                },
                title: resource.name != null ? resource.name : resource.id,
            }).elements[0];

            if (resource.datastore_active === true || resource.webstore_url === "active") {
                entry.addEventListener('click', resource_item_click_builder.call(this, resource), true);
            } else {
                entry.classList.add('disabled');
            }
            this.resource_tab_content.appendChild(entry);
        }, this);
    };


    // =========================================================================
    // SHOW/HIDE ERROR MESSAGE
    // =========================================================================

    var showWarn = function showWarn(msg) {
        this.warn_element.innerHTML = msg;
        this.warn_element.classList.remove('hidden');
    };

    var buildErrorDiv = function buildErrorDiv(error) {
        var message, via_header, details;

        message = document.createElement('div');
        message.className = "alert alert-danger";
        // Currently, error details are described using ...
        if (typeof error === 'string') {
            // ... directly a string message
            message.textContent = error;
        } else {
            // ... or a response object
            // In this case, we are always using the WireCloud's proxy, so we can make some assumptions
            via_header = error.getHeader('Via');
            if (error.status === 0) {
                message.textContent = "Connection error";
            } else if (via_header == null) {
                // Error coming from WireCloud's proxy
                switch (error.status) {
                case 403:
                    message.textContent = "You aren't allowed to use the WireCloud proxy. Have you signed off from WireCloud?";
                    break;
                case 502:
                case 504:
                    details = JSON.parse(error.responseText);
                    message.textContent = "Error connecting to CKAN: " + details.description;
                    break;
                default:
                    message.textContent = "Unexpected response from WireCloud's proxy";
                }
            } else {
                message.textContent = "Unexpected response from CKAN: " + error.status + " - " + error.statusText;
            }
        }

        return message;
    };

    var showFloatingError = function showFloatingError(error) {
        // Do nothing for now
    };

    var showError = function showError(container, error) {
        container.clear();
        container.appendChild(buildErrorDiv(error));
    };

    var hideErrorAndWarn = function hideErrorAndWarn(e) {
        /*
        this.error_element.classList.add('hidden');
        this.warn_element.classList.add('hidden');
        */
    };


    // =========================================================================
    // FUNCTION TO LOAD THE DATASETS OF A CKAN INSTANCE
    // =========================================================================

    var clear_resource_tab = function clear_resource_tab() {
        this.resource_tab_title.clear();
        this.resource_tab_content.clear();
        this.resource_tab.repaint();
    };

    var loadInitialDataSets = function loadInitialDataSets() {
        hideErrorAndWarn();                   // Hide error message
        this.ckan_dataset_source.refresh();
    };


    // =========================================================================
    // CREATE THE GRAPHIC ELEMENTS
    // =========================================================================

    var create_search_input = function create_search_input() {

        var southLayout = new se.HorizontalLayout({'class': 'input input-prepend input-append'});

        // Function to be call when the user clicks on "search" or types "enter"
        var filter = function filter() {
            this.ckan_dataset_source.changeOptions({'keywords': this.textInput.getValue()});
        };

        var searchAddon = new se.Addon({'title': 'Search', 'class': 'btn-primary'});
        southLayout.west.appendChild(searchAddon);

        // Set search icon
        var searchIcon = document.createElement('i');
        searchIcon.className = 'icon-search';
        searchAddon.appendChild(searchIcon);

        // Set input field
        this.textInput = new se.TextField({placeholder: 'Filter'});
        this.textInput.addEventListener('submit', filter.bind(this));
        southLayout.center.appendChild(this.textInput);
        searchAddon.assignInput(this.textInput);

        // Set search button
        var search_button = new se.Button({
            text: 'Search'
        });
        search_button.addEventListener('click', filter.bind(this));
        southLayout.east.appendChild(search_button);

        return southLayout;
    };

    return Widget;

})(StyledElements);
