/*jshint scripturl: true*/
/*global marked, MashupPlatform, StyledElements*/

(function () {

    'use strict';

    var layout, notebook, dataset_tab, resource_tab, resource_tab_title, resource_tab_content, selected_dataset, selected_resource, connection_info, error, load_more, warn;
    var page = 0;
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

    var make_request = function make_request(url, method, onSuccess, onFailure, onComplete) {

        MashupPlatform.http.makeRequest(url, {
            method: method,

            requestHeaders: {
                Authorization: MP.prefs.get('auth_token')
            },

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

    var render_datasets = function render_datasets(response) {
        response = JSON.parse(response.responseText);
        var datasets = response.result.results;

        var dataset, entry, header, access_label, description, tags, tag;
        dataset_tab.clear();
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
            }
            header.appendChild(document.createTextNode(dataset.title));
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
            }
            entry.appendChild(tags);

            if (!dataset.private) {
                entry.addEventListener('click', dataset_item_click.bind(dataset), true);
            }
            dataset_tab.appendChild(entry);
        }

        //Hide the add load more datasets button if we get less than MAX_ROWS records
        if (datasets.length < MAX_ROWS) {
            load_more.classList.add('hidden');
        }
    };

    var resource_itemt_click = function resource_itemt_click() {
        selected_resource = this;
        resourceSelectChange();
    };

    var render_resources = function render_resources(response) {
        var dataset = JSON.parse(response.responseText);
        var resources = dataset.result.resources;

        var resource, entry, header, description, tag;
        resource_tab_content.clear();
        for (var i = 0; i < resources.length; i++) {
            resource = resources[i];

            entry = document.createElement('div');
            entry.className = 'item';
            header = document.createElement('h4');
            header.textContent = resource.name != null ? resource.name : resource.id;
            tag = document.createElement('span');
            tag.className = 'label label-info';
            tag.textContent = resource.format;
            header.appendChild(tag);
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

    var loadDataSets = function loadDataSets() {
        var start = page++ * MAX_ROWS;
        clear_resource_tab();
        dataset_tab.disable();
        make_request(MP.prefs.get('ckan_server') + '/api/3/action/dataset_search?rows=' + MAX_ROWS + '&start=' +
                     start, 'GET', render_datasets, showError, dataset_tab.enable.bind(dataset_tab));
    };

    var clear_resource_tab = function clear_resource_tab() {
        resource_tab_title.clear();
        resource_tab_content.clear();
        resource_tab.repaint();
    };

    var loadInitialDataSets = function loadInitialDataSets() {
        hideErrorAndWarn();                   //Hide error message
        load_more.classList.remove('hidden'); //Display the load_more button
        page = 0;                             //Reset the page number

        //Fullfill the list of datasets
        loadDataSets();
    };


    ///////////////////////////////
    //CREATE THE GRAPHIC ELEMENTS//
    ///////////////////////////////

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

        /*
        // Update Button
        var updateButton = new StyledElements.StyledButton({"class": "icon-refresh", plain: true});
        updateButton.addEventListener('click', loadInitialDataSets.bind(this));
        updateButton.insertInto(title);
        */

        //Create the button to add more datasets
        load_more = document.createElement('a');
        load_more.innerHTML = '<i class="icon-download"></i> Load more datasets...';
        load_more.addEventListener('click', loadDataSets.bind(this));
        dataset_tab.appendChild(load_more);

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
