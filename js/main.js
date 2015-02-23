/*jshint scripturl: true*/
/*global marked, MashupPlatform, StyledElements*/

(function () {

    'use strict';

    var ckan_dataset_source, textInput;
    var layout, notebook, dataset_tab, dataset_tab_content, resource_tab, resource_tab_title, resource_tab_content, selected_dataset, selected_resource, connection_info, pagination, error, warn;
    var MAX_ROWS = 20;
    var MP = MashupPlatform;

    //CKAN types must be transformed in JS types
    //to be used across the different widgets
    var TYPE_MAPPING = {
        'text': 'string',
        'numeric': 'number',
        'int4': 'number',
        'timestamp': 'date'
    };


    ////////////
    //AUXILIAR//
    ////////////

    var make_request = function make_request(url, method, onSuccess, onFailure, onComplete, parameters) {

        var headers = {};

        var auth_token = MP.prefs.get('auth_token').trim();
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
        connection_info.clear();
        connection_info.appendChild(document.createTextNode('CKAN Server: ' + MP.prefs.get('ckan_server')));
        layout.repaint();
    };


    ///////////////////////
    //GET THE PREFERENCES//
    ///////////////////////

    var prefHandler = function prefHandler(preferences) {
        loadInitialDataSets();
        set_connected_to();
    };

    MashupPlatform.prefs.registerCallback(prefHandler);


    ////////////////////////////////////////
    //HANDLERS USED WHEN THE SELECT CHANGE//
    ////////////////////////////////////////

    var datasetSelectChange = function datasetSelectChange() {
        hideErrorAndWarn();                     //Hide error message
        resource_tab_title.clear();
        resource_tab_title.appendChild(document.createTextNode('Resources available on the '));
        var strong = document.createElement('strong');
        strong.textContent = selected_dataset.title;
        resource_tab_title.appendChild(strong);
        resource_tab_title.appendChild(document.createTextNode(' dataset'));

        resource_tab.repaint();
        resource_tab.disable();
        make_request(MP.prefs.get('ckan_server') + '/api/action/dataset_show?id=' + selected_dataset.id, 'GET', render_resources, showError, resource_tab.enable.bind(resource_tab));
    };

    var resourceSelectChange = function resourceSelectChange() {
        hideErrorAndWarn();  //Hide error message
        make_request(MP.prefs.get('ckan_server') + '/api/action/datastore_search?limit=' + MP.prefs.get('limit_rows') +
                '&resource_id=' + selected_resource.id, 'GET', pushResourceData, showError);
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
                if (finalData.structure[i].type in TYPE_MAPPING) {
                    finalData.structure[i].type = TYPE_MAPPING[finalData.structure[i].type];
                }
            }

            //Push the data through the wiring
            MashupPlatform.wiring.pushEvent('resource', JSON.stringify(finalData));

            //Show warn message if limit_rows < resource elements
            var resource_total = resource.result.total;
            if (resource_total > MP.prefs.get('limit_rows')) {
                showWarn('<strong>WARNING:</strong> The number of records of the resource is higher ' +
                        'that the max number of elements to retrieve. If you want to see all the records, ' +
                        'increase the max number of elements to retrieve by editing the widget settings. ' +
                        '<br/>Current Value: ' + MP.prefs.get('limit_rows') + ' - Resource elements: ' + resource_total);
            }

        } else {
            showError();
        }
    };

    var dataset_item_click = function dataset_item_click() {
        selected_dataset = this;
        datasetSelectChange();
        notebook.goToTab(resource_tab);
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
        dataset_tab_content.clear();
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
                tag.addEventListener('click', function (tagName) {
                    var keywords = textInput.getValue();
                    var tagQuery = "tags:" + replaceAll(tagName, " ", "\\ ");
                    if (keywords.indexOf(tagQuery) === -1) {
                        keywords = tagQuery + " " + keywords;
                        ckan_dataset_source.changeOptions({keywords: keywords});
                    }
                }.bind(null, dataset.tags[j].name), true);
            }
            entry.appendChild(tags);

            dataset_tab_content.appendChild(entry);
        }
    };

    var resource_itemt_click = function resource_itemt_click() {
        selected_resource = this;
        resourceSelectChange();
    };

    var render_resources = function render_resources(response) {
        var dataset = JSON.parse(response.responseText);
        var resources = dataset.result.resources;

        var resource, entry, header, description, format;
        resource_tab_content.clear();
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
                entry.addEventListener('click', resource_itemt_click.bind(resource), true);
            } else {
                entry.classList.add('disabled');
            }
            resource_tab_content.appendChild(entry);
        }
    };


    ///////////////////////////
    //SHOW/HIDE ERROR MESSAGE//
    ///////////////////////////

    var showWarn = function showWarn(msg) {
        warn.innerHTML = msg;
        warn.classList.remove('hidden');
    };

    var showError = function showError(e) {

        if (e && e.status && e.statusText) {
            error.innerHTML = e.status + ' - ' + e.statusText;
        } else {
            error.innerHTML = 'An error arises processing your request';
        }

        error.classList.remove('hidden');
    };

    var hideErrorAndWarn = function hideErrorAndWarn(e) {
        /*error.classList.add('hidden');
        warn.classList.add('hidden');*/
    };


  ////////////////////////////////////////////////////
  //FUNCTION TO LOAD THE DATASETS OF A CKAN INSTANCE//
  ////////////////////////////////////////////////////

    var clear_resource_tab = function clear_resource_tab() {
        resource_tab_title.clear();
        resource_tab_content.clear();
        resource_tab.repaint();
    };

    var loadInitialDataSets = function loadInitialDataSets() {
        hideErrorAndWarn();                   //Hide error message
        ckan_dataset_source.refresh();
    };


    ///////////////////////////////
    //CREATE THE GRAPHIC ELEMENTS//
    ///////////////////////////////

    var create_search_input = function create_search_input() {

        var southLayout = new StyledElements.HorizontalLayout({'class': 'input input-prepend input-append'});

        // Function to be call when the user clicks on "search" or types "enter"
        var filter = function filter() {
            ckan_dataset_source.changeOptions({'keywords': textInput.getValue()});
        }

        var searchAddon = new StyledElements.Addon({'title': 'Search', 'class': 'btn-primary'});
        southLayout.getWestContainer().appendChild(searchAddon);

        // Set search icon
        var searchIcon = document.createElement('i');
        searchIcon.className = 'icon-search';
        searchAddon.appendChild(searchIcon);

        // Set input field
        textInput = new StyledElements.StyledTextField({placeholder: 'Filter'});
        textInput.addEventListener('submit', filter.bind(this));
        southLayout.getCenterContainer().appendChild(textInput);
        searchAddon.assignInput(textInput);

        // Set search button
        var search_button = new StyledElements.StyledButton({
            text: 'Search'
        });
        search_button.addEventListener('click', filter.bind(this));
        southLayout.getEastContainer().appendChild(search_button);

        return southLayout;
    };

    var init = function init() {

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

        layout = new StyledElements.BorderLayout();
        layout.insertInto(document.body);

        notebook = new StyledElements.StyledNotebook();
        layout.getCenterContainer().appendChild(notebook);

        dataset_tab = notebook.createTab({name: "Dataset", closable: false});
        var dataset_tab_layout = new StyledElements.BorderLayout();
        dataset_tab.appendChild(dataset_tab_layout);
        dataset_tab_content = dataset_tab_layout.getCenterContainer();
        dataset_tab_content.addClassName('container-content');

        /*
        // Update Button
        var updateButton = new StyledElements.StyledButton({"class": "icon-refresh", plain: true});
        updateButton.addEventListener('click', loadInitialDataSets.bind(this));
        updateButton.insertInto(title);
        */


        ckan_dataset_source = new StyledElements.PaginatedSource({
            'pageSize': MAX_ROWS,
            'order_by': '-creation_date',
            'keywords': '',
            'scope': 'all',
            'requestFunc': function (page, options, onSuccess, onError) {
                var start = page * MAX_ROWS;
                make_request(MP.prefs.get('ckan_server') + '/api/3/action/package_search',
                             'GET', process_dataset_search_response.bind(null, onSuccess, onError, page), onError, null, {rows: MAX_ROWS, start: start, q: options.keywords});
            },
            'processFunc': render_datasets
        });
        ckan_dataset_source.addEventListener('optionsChanged', function (source, options) {
            textInput.setValue(options.keywords);
        }.bind(this));

        ckan_dataset_source.addEventListener('requestStart', function () {
            clear_resource_tab();
            dataset_tab.disable();
        }.bind(this));
        ckan_dataset_source.addEventListener('requestEnd', dataset_tab.enable.bind(dataset_tab));

        // Add search input
        dataset_tab_layout.getNorthContainer().appendChild(create_search_input());

        // Add dataset pagination
        pagination = new StyledElements.PaginationInterface(ckan_dataset_source);
        dataset_tab_layout.getSouthContainer().appendChild(pagination);

        resource_tab = notebook.createTab({name: "Resource", closable: false});
        var resource_tab_layout = new StyledElements.BorderLayout();
        resource_tab.appendChild(resource_tab_layout);
        resource_tab_title = resource_tab_layout.getNorthContainer();
        resource_tab_title.addClassName('container-content');
        resource_tab_content = resource_tab_layout.getCenterContainer();
        resource_tab_content.addClassName('container-content');

        /*Create the error div
          error = document.createElement('div');
          error.setAttribute('class', 'alert alert-danger');
          resource_tab.appendChild(error);

        //Create the warn div
        warn = document.createElement('div');
        warn.setAttribute('class', 'alert alert-warn');
        resource_tab.appendChild(warn);
        */

        //Create the bottom information info
        connection_info = layout.getSouthContainer();
        layout.getSouthContainer().addClassName('container-content');

        // Initial load
        set_connected_to();
        loadInitialDataSets();

        // Initial repaint
        layout.repaint();

        MashupPlatform.widget.context.registerCallback(function (changes) {
            if ('widthInPixels' in changes || 'heightInPixels' in changes) {
                layout.repaint();
            }
        });
    };

    //Start the execution when the DOM is enterely loaded
    document.addEventListener('DOMContentLoaded', init.bind(this), true);

})();
