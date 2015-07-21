/*
 * Copyright (c) 2014-2015 CoNWeT Lab., Universidad Politécnica de Madrid
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

/* jshint scripturl: true */
/* global marked, MashupPlatform, StyledElements */

window.Widget = (function () {

    'use strict';

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

        //CKAN types must be transformed in JS types
        //to be used across the different widgets
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

        this.layout = new StyledElements.BorderLayout();
        this.layout.insertInto(document.body);

        this.notebook = new StyledElements.StyledNotebook();
        this.layout.getCenterContainer().appendChild(this.notebook);

        this.dataset_tab = this.notebook.createTab({name: "Dataset", closable: false});
        var dataset_tab_layout = new StyledElements.BorderLayout();
        this.dataset_tab.appendChild(dataset_tab_layout);
        this.dataset_tab_content = dataset_tab_layout.getCenterContainer();
        this.dataset_tab_content.addClassName('container-content');

        /*
        // Update Button
        var updateButton = new StyledElements.StyledButton({"class": "icon-refresh", plain: true});
        updateButton.addEventListener('click', loadInitialDataSets.bind(this));
        updateButton.insertInto(title);
        */

        this.ckan_dataset_source = new StyledElements.PaginatedSource({
            'pageSize': this.MAX_ROWS,
            'order_by': '-creation_date',
            'keywords': '',
            'scope': 'all',
            'requestFunc': function (page, options, onSuccess, onError) {
                var start = (page - 1) * this.MAX_ROWS;
                make_request(this.MP.prefs.get('ckan_server') + '/api/3/action/package_search',
                             'GET', process_dataset_search_response.bind(null, onSuccess, onError, page), onError, null, {rows: this.MAX_ROWS, start: start, q: options.keywords});
            },
            'processFunc': render_datasets
        });
        this.ckan_dataset_source.addEventListener('optionsChanged', function (source, options) {
            this.textInput.setValue(options.keywords);
        }.bind(this));

        this.ckan_dataset_source.addEventListener('requestStart', function () {
            clear_resource_tab();
            this.dataset_tab.disable();
        }.bind(this));
        this.ckan_dataset_source.addEventListener('requestEnd', this.dataset_tab.enable.bind(this.dataset_tab));

        // Add search input
        dataset_tab_layout.getNorthContainer().appendChild(create_search_input());

        // Add dataset pagination
        this.pagination = new StyledElements.PaginationInterface(this.ckan_dataset_source, {
            layout: '<s:styledgui xmlns:s="http://wirecloud.conwet.fi.upm.es/StyledElements" xmlns:t="http://wirecloud.conwet.fi.upm.es/Template" xmlns="http://www.w3.org/1999/xhtml"><t:firstBtn/><t:prevBtn/><div class="box">Page: <t:currentPage/>/<t:totalPages/></div><t:nextBtn/><t:lastBtn/> <strong><t:totalCount/> datasets found</strong></s:styledgui>'
        });
        dataset_tab_layout.getSouthContainer().appendChild(this.pagination);

        this.resource_tab = this.notebook.createTab({name: "Resource", closable: false});
        var resource_tab_layout = new StyledElements.BorderLayout();
        this.resource_tab.appendChild(resource_tab_layout);
        this.resource_tab_title = resource_tab_layout.getNorthContainer();
        this.resource_tab_title.addClassName('container-content');
        this.resource_tab_content = resource_tab_layout.getCenterContainer();
        this.resource_tab_content.addClassName('container-content');

        /*Create the error div
          this.error_element = document.createElement('div');
          this.error_element.setAttribute('class', 'alert alert-danger');
          resource_tab.appendChild(this.error_element);

        //Create the warn div
        this.warn_element = document.createElement('div');
        this.warn_element.setAttribute('class', 'alert alert-warn');
        resource_tab.appendChild(this.warn_element);
        */

        //Create the bottom information info
        this.connection_info = this.layout.getSouthContainer();
        this.layout.getSouthContainer().addClassName('container-content');

        // Initial load
        set_connected_to();
        loadInitialDataSets();

        // Initial repaint
        this.layout.repaint();

        /*MashupPlatform.widget.context.registerCallback(function (changes) {
            if ('widthInPixels' in changes || 'heightInPixels' in changes) {
                this.layout.repaint();
            }
        });*/
    };

    /* ==================================================================================
     *  PRIVATE METHODS
     * ================================================================================== */

    ////////////
    //AUXILIAR//
    ////////////

    var make_request = function make_request(url, method, onSuccess, onFailure, onComplete, parameters) {

        var headers = {};

        var auth_token = this.MP.prefs.get('auth_token').trim();
        if (auth_token !== '') {
            headers = {
                'Authentication': auth_token
            };
        } else if (MashupPlatform.context.get('fiware_token_available')) {
            headers = {
                'X-FI-WARE-OAuth-Token': 'true',
                'X-FI-WARE-OAuth-Header-Name': 'X-Auth-Token'
            };
        }

        MashupPlatform.http.makeRequest(url, {
            method: method,
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


    ///////////////////////
    //GET THE PREFERENCES//
    ///////////////////////

    var prefHandler = function prefHandler(preferences) {
        loadInitialDataSets();
        set_connected_to();
    };

    //MashupPlatform.prefs.registerCallback(prefHandler);


    ////////////////////////////////////////
    //HANDLERS USED WHEN THE SELECT CHANGE//
    ////////////////////////////////////////

    var datasetSelectChange = function datasetSelectChange() {
        hideErrorAndWarn();                     //Hide error message
        this.resource_tab_title.clear();
        this.resource_tab_title.appendChild(document.createTextNode('Resources available on the '));
        var strong = document.createElement('strong');
        strong.textContent = this.selected_dataset.title;
        this.resource_tab_title.appendChild(strong);
        this.resource_tab_title.appendChild(document.createTextNode(' dataset'));

        this.resource_tab.repaint();
        this.resource_tab.disable();
        make_request(this.MP.prefs.get('ckan_server') + '/api/action/dataset_show?id=' + this.selected_dataset.id, 'GET', render_resources, showError, this.resource_tab.enable.bind(this.resource_tab));
    };

    var resourceSelectChange = function resourceSelectChange() {
        hideErrorAndWarn();  //Hide error message
        make_request(this.MP.prefs.get('ckan_server') + '/api/action/datastore_search?limit=' + this.MP.prefs.get('limit_rows') +
                '&resource_id=' + this.selected_resource.id, 'GET', pushResourceData, showError);
    };


    //////////////////////////////////////////////////////////
    //FUNCTIONS CALLED WHEN THE HTTP REQUEST FINISH WITH 200//
    //////////////////////////////////////////////////////////

    var pushResourceData = function pushResourceData(response) {

        var resource = JSON.parse(response.responseText);

        if (resource.success) {

            var finalData = {
                structure: resource.result.fields,
                data: resource.result.records
            };

            //Type transformation
            for (var i = 0; i < finalData.structure.length; i++) {
                if (finalData.structure[i].type in this.TYPE_MAPPING) {
                    finalData.structure[i].type = this.TYPE_MAPPING[finalData.structure[i].type];
                }
            }

            //Push the data through the wiring
            MashupPlatform.wiring.pushEvent('resource', JSON.stringify(finalData));

            //Show warn message if limit_rows < resource elements
            var resource_total = resource.result.total;
            if (resource_total > this.MP.prefs.get('limit_rows')) {
                showWarn('<strong>WARNING:</strong> The number of records of the resource is higher ' +
                        'that the max number of elements to retrieve. If you want to see all the records, ' +
                        'increase the max number of elements to retrieve by editing the widget settings. ' +
                        '<br/>Current Value: ' + this.MP.prefs.get('limit_rows') + ' - Resource elements: ' + resource_total);
            }

        } else {
            showError();
        }
    };

    var dataset_item_click = function dataset_item_click() {
        this.selected_dataset = this;
        datasetSelectChange();
        this.notebook.goToTab(this.resource_tab);
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
        var dataset, entry, header, header_link, access_label, description, tags, tag;
        this.dataset_tab_content.clear();
        for (var i = 0; i < datasets.length; i++) {
            dataset = datasets[i];

            entry = document.createElement('div');
            entry.className = 'item';
            header = document.createElement('h4');
            if (dataset.private) {
                access_label = document.createElement('span');
                access_label.className = 'label label-inverse';
                access_label.textContent = 'PRIVATE';
                header.appendChild(access_label);
                entry.classList.add('disabled');
                header_link = document.createElement('span');
            } else {
                header_link = document.createElement('a');
                header_link.setAttribute('role', 'button');
                header_link.setAttribute('tabindex', '0');
                header_link.addEventListener('click', dataset_item_click.bind(dataset), true);
            }
            header_link.textContent = dataset.title;
            header.appendChild(header_link);
            entry.appendChild(header);
            if (dataset.notes) {
                description = document.createElement('article');
                description.innerHTML = marked(dataset.notes);
                entry.appendChild(description);
            }

            tags = document.createElement('p');
            for (var j = 0; j < dataset.tags.length; j++) {
                tag = document.createElement('span');
                tag.className = 'label label-success';
                tag.textContent = dataset.tags[j].display_name;
                tags.appendChild(tag);
                tag.addEventListener('click', filter_by_tag.bind(null, dataset.tags[j].name), true);
            }
            entry.appendChild(tags);

            this.dataset_tab_content.appendChild(entry);
        }
    };

    var filter_by_tag = function filter_by_tag(tagName) {
        var keywords = this.textInput.getValue();
        var tagQuery = "tags:" + replaceAll(tagName, " ", "\\ ");
        if (keywords.indexOf(tagQuery) === -1) {
            keywords = tagQuery + " " + keywords;
            this.ckan_dataset_source.changeOptions({keywords: keywords});
        }
    };

    var resource_item_click = function resource_item_click() {
        this.selected_resource = this;
        resourceSelectChange();
    };

    var render_resources = function render_resources(response) {
        var dataset = JSON.parse(response.responseText);
        var resources = dataset.result.resources;

        var resource, entry, header, description, format;
        this.resource_tab_content.clear();
        for (var i = 0; i < resources.length; i++) {
            resource = resources[i];

            entry = document.createElement('div');
            entry.className = 'item';
            header = document.createElement('h4');
            format = document.createElement('span');
            format.className = 'label label-info';
            format.textContent = resource.format;
            header.appendChild(format);
            header.appendChild(document.createTextNode(resource.name != null ? resource.name : resource.id));
            entry.appendChild(header);
            description = document.createElement('p');
            description.textContent = resource.description;
            entry.appendChild(description);

            if (resource.datastore_active === true) {
                entry.addEventListener('click', resource_item_click.bind(resource), true);
            } else {
                entry.classList.add('disabled');
            }
            this.resource_tab_content.appendChild(entry);
        }
    };


    ///////////////////////////
    //SHOW/HIDE ERROR MESSAGE//
    ///////////////////////////

    var showWarn = function showWarn(msg) {
        this.warn_element.innerHTML = msg;
        this.warn_element.classList.remove('hidden');
    };

    var showError = function showError(e) {

        if (e && e.status && e.statusText) {
            this.error_element.innerHTML = e.status + ' - ' + e.statusText;
        } else {
            this.error_element.innerHTML = 'An error arises processing your request';
        }

        this.error_element.classList.remove('hidden');
    };

    var hideErrorAndWarn = function hideErrorAndWarn(e) {
        /*this.error_element.classList.add('hidden');
        this.warn_element.classList.add('hidden');*/
    };


  ////////////////////////////////////////////////////
  //FUNCTION TO LOAD THE DATASETS OF A CKAN INSTANCE//
  ////////////////////////////////////////////////////

    var clear_resource_tab = function clear_resource_tab() {
        this.resource_tab_title.clear();
        this.resource_tab_content.clear();
        this.resource_tab.repaint();
    };

    var loadInitialDataSets = function loadInitialDataSets() {
        hideErrorAndWarn();                   //Hide error message
        this.ckan_dataset_source.refresh();
    };


    ///////////////////////////////
    //CREATE THE GRAPHIC ELEMENTS//
    ///////////////////////////////

    var create_search_input = function create_search_input() {

        var southLayout = new StyledElements.HorizontalLayout({'class': 'input input-prepend input-append'});

        // Function to be call when the user clicks on "search" or types "enter"
        var filter = function filter() {
            this.ckan_dataset_source.changeOptions({'keywords': this.textInput.getValue()});
        };

        var searchAddon = new StyledElements.Addon({'title': 'Search', 'class': 'btn-primary'});
        southLayout.getWestContainer().appendChild(searchAddon);

        // Set search icon
        var searchIcon = document.createElement('i');
        searchIcon.className = 'icon-search';
        searchAddon.appendChild(searchIcon);

        // Set input field
        this.textInput = new StyledElements.StyledTextField({placeholder: 'Filter'});
        this.textInput.addEventListener('submit', filter.bind(this));
        southLayout.getCenterContainer().appendChild(this.textInput);
        searchAddon.assignInput(this.textInput);

        // Set search button
        var search_button = new StyledElements.StyledButton({
            text: 'Search'
        });
        search_button.addEventListener('click', filter.bind(this));
        southLayout.getEastContainer().appendChild(search_button);

        return southLayout;
    };

    return Widget;

})();
