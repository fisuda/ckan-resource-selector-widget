(function () {

  'use strict';

  var preference_ckan_server = 'ckan_server'
  var preference_auth_token = 'auth_token'
  var preference_limit_rows = 'limit_rows'
  var ckan_server = MashupPlatform.prefs.get(preference_ckan_server);
  var auth_token = MashupPlatform.prefs.get(preference_auth_token);
  var limit_rows = MashupPlatform.prefs.get(preference_limit_rows);
  var layout, notebook, dataset_tab, resource_tab, selected_dataset, selected_resource, resource_select_title, connection_info, title, error, load_more, warn;
  var page = 0;
  var MAX_ROWS = 10;

  //CKAN types must be transformed in JS types
  //to be used across the different widgets
  var TYPE_MAPPING = {
    'text': 'string',
    'numeric': 'number',
    'int4': 'number',
    'timestamp': 'date'
  }


  ////////////
  //AUXILIAR//
  ////////////

  var make_request = function(url, method, onSuccess, onFailure, onComplete) {

    MashupPlatform.http.makeRequest(url, {
      method: method,

      requestHeaders: {
        Authorization: auth_token
      },
      
      onSuccess: onSuccess,
      onFailure: onFailure,
      onComplete: onComplete
    });

  }

  var set_connected_to = function set_connected_to() {
    connection_info.innerHTML = 'CKAN Server: ' + ckan_server;
  };


  ///////////////////////
  //GET THE PREFERENCES//
  ///////////////////////

  var prefHandler = function(preferences) {
    ckan_server = preference_ckan_server in preferences ? preferences[preference_ckan_server] : ckan_server;
    auth_token = preference_auth_token in preferences ? preferences[preference_auth_token] : auth_token;
    limit_rows = preference_limit_rows in preferences ? preferences[preference_limit_rows] : limit_rows;
    loadInitialDataSets();
    set_connected_to();
  }

  MashupPlatform.prefs.registerCallback(prefHandler);


  ////////////////////////////////////////
  //HANDLERS USED WHEN THE SELECT CHANGE//
  ////////////////////////////////////////

  var datasetSelectChange = function() {
    hideErrorAndWarn();                     //Hide error message
    resource_select_title.innerHTML = 'Select the resource from the <strong>' + selected_dataset.title +
        '</strong> dataset that you want to be displayed';

    resource_tab.disable();
    make_request(ckan_server + '/api/action/dataset_show?id=' + selected_dataset.id, 'GET', insertResources, showError, resource_tab.enable.bind(resource_tab));
  }

  var resourceSelectChange = function() {
    hideErrorAndWarn();  //Hide error message
    make_request(ckan_server + '/api/action/datastore_search?limit=' + limit_rows + 
        '&resource_id=' + selected_resource.id, 'GET', pushResourceData, showError);
  }


  //////////////////////////////////////////////////////////
  //FUNCTIONS CALLED WHEN THE HTTP REQUEST FINISH WITH 200//
  //////////////////////////////////////////////////////////

  var pushResourceData = function(response) {

    var resource = JSON.parse(response.responseText);

    if (resource['success']) {

      var finalData = {
        structure: resource['result']['fields'],
        data: resource['result']['records']
      }

      //Type transformation
      for (var i = 0; i < finalData.structure.length; i++) {
        if (finalData.structure[i].type in TYPE_MAPPING) {
          finalData.structure[i].type = TYPE_MAPPING[finalData.structure[i].type]; 
        }
      }

      //Push the data through the wiring
      MashupPlatform.wiring.pushEvent('resource', JSON.stringify(finalData));

      //Show warn message if limit_rows < resource elements
      var resource_total = resource['result']['total'];
      if (resource_total > limit_rows) {
        showWarn('<strong>WARNING:</strong> The number of records of the resource is higher ' +
          'that the max number of elements to retrieve. If you want to see all the records, ' +
          'increase the max number of elements to retrieve by editing the widget settings. ' + 
          '<br/>Current Value: ' + limit_rows + ' - Resource elements: ' + resource_total)
      }

    } else {
      showError();
    }
  }

  var render_datasets = function render_datasets(response) {
      var response = JSON.parse(response.responseText);
      var datasets = response.result.results;

      var dataset, entry, header, description, tags, tag;
      dataset_tab.clear();
      for (var i = 0; i < datasets.length; i++) {
          dataset = datasets[i];

          entry = document.createElement('div');
          entry.className = 'item';
          header = document.createElement('h4');
          header.textContent = dataset.title;
          entry.appendChild(header);
          description = document.createElement('p');
          description.textContent = dataset.notes;
          entry.appendChild(description);

          tags = document.createElement('p');
          for (var j = 0; j < dataset.tags.length; j++) {
              tag = document.createElement('span');
              tag.className = 'label label-success';
              tag.textContent = dataset.tags[j].display_name;
              tags.appendChild(tag);
          }
          entry.appendChild(tags);

          entry.addEventListener('click', function () {
              selected_dataset = this;
              datasetSelectChange();
              notebook.goToTab(resource_tab);
          }.bind(dataset), true);
          dataset_tab.appendChild(entry);
      }

      //Hide the add load more datasets button if we get less than MAX_ROWS records
      if (datasets.length < MAX_ROWS) {
          load_more.classList.add('hidden');
      }
  };

  var insertResources = function(response) {
      var dataset = JSON.parse(response.responseText);
      var resources = dataset.result.resources;
      var entries = [];

      var resource, entry, header, description, tag;
      resource_tab.clear();
      for (var i = 0; i < resources.length; i++) {
          resource = resources[i];

          entry = document.createElement('div');
          entry.className = 'item';
          header = document.createElement('h4');
          header.textContent = resource.name != null ? resource.name : resource.id;
          tag = document.createElement('span');
          tag.className = 'label label-success';
          tag.textContent = resource.format;
          header.appendChild(tag);
          entry.appendChild(header);
          description = document.createElement('p');
          description.textContent = resource.description;
          entry.appendChild(description);

          entry.addEventListener('click', function () {
              selected_resource = this;
              resourceSelectChange();
          }.bind(resource), true);
          resource_tab.appendChild(entry);
      }

    resourceSelectChange();               //First call
  }


  ///////////////////////////
  //SHOW/HIDE ERROR MESSAGE//
  ///////////////////////////

  var showWarn = function(msg) {
    warn.innerHTML = msg
    warn.classList.remove('hidden');
  }

  var showError = function(e) {

    if (e && e.status && e.statusText) {
      error.innerHTML = e.status + ' - ' + e.statusText;
    } else {
      error.innerHTML = 'An error arises processing your request'
    }

    error.classList.remove('hidden');
  }

  var hideErrorAndWarn = function(e) {
    error.classList.add('hidden');
    warn.classList.add('hidden');
  };


  ////////////////////////////////////////////////////
  //FUNCTION TO LOAD THE DATASETS OF A CKAN INSTANCE//
  ////////////////////////////////////////////////////

  var loadDataSets = function() {
    var start = page++ * MAX_ROWS;
    make_request(ckan_server + '/api/3/action/dataset_search?rows=' + MAX_ROWS + '&start=' + 
                 start, 'GET', render_datasets, showError);
  };

  var loadInitialDataSets = function() {
    resource_select_title.innerHTML = ''  //Remove dataset name
    hideErrorAndWarn();                   //Hide error message
    load_more.classList.remove('hidden'); //Display the load_more button
    page = 0;                             //Reset the page number

    //Fullfill the list of datasets
    loadDataSets();

  }


  ///////////////////////////////
  //CREATE THE GRAPHIC ELEMENTS//
  ///////////////////////////////

  var init = function() {

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

    //Create the resource title
    resource_select_title = document.createElement('p');
    resource_tab.appendChild(resource_select_title);

    //Create the error div
    error = document.createElement('div');
    error.setAttribute('class', 'alert alert-danger');
    resource_tab.appendChild(error);

    //Create the warn div
    warn = document.createElement('div');
    warn.setAttribute('class', 'alert alert-warn');
    resource_tab.appendChild(warn);

    //Create the bottom information info
    connection_info = document.createElement('p');
    layout.getSouthContainer().appendChild(connection_info);
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
  }

  //Start the execution when the DOM is enterely loaded
  document.addEventListener('DOMContentLoaded', init.bind(this), true);

})();
