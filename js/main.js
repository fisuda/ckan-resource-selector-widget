(function () {

  'use strict';

  var preference_ckan_server = 'ckan_server';
  var preference_limit_rows = 'limit_rows';
  var ckan_server = MashupPlatform.prefs.get(preference_ckan_server);
  var limit_rows = MashupPlatform.prefs.get(preference_limit_rows);
  var layout, dataset_select, resource_select, resource_select_title, connection_info, title, error, load_more, warn;
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

  var make_request = function(url, method, onSuccess, onFailure) {

    layout.getCenterContainer().disable();  //Disable the center container
    
    MashupPlatform.http.makeRequest(url, {
      method: method,

      requestHeaders: {
        'X-FI-WARE-OAuth-Token': 'true',
        'X-FI-WARE-OAuth-Header-Name': 'X-Auth-Token'
	},
      
      onSuccess: function(response) {
        layout.getCenterContainer().enable();
        onSuccess.call(this, response);
      },
      
      onFailure: function(response) {
        layout.getCenterContainer().enable();
        onFailure.call(this, response);
      }
    });

  }

  var set_connected_to = function() {
    connection_info.innerHTML = 'CKAN Server: ' + ckan_server;
  }


  ///////////////////////
  //GET THE PREFERENCES//
  ///////////////////////

  var prefHandler = function(preferences) {
    ckan_server = preference_ckan_server in preferences ? preferences[preference_ckan_server] : ckan_server;
    limit_rows = preference_limit_rows in preferences ? preferences[preference_limit_rows] : limit_rows;
    loadInitialDataSets();
    set_connected_to();
  }

  MashupPlatform.prefs.registerCallback(prefHandler);


  ////////////////////////////////////////
  //HANDLERS USED WHEN THE SELECT CHANGE//
  ////////////////////////////////////////

  var datasetSelectChange = function() {
    var dataset_id = dataset_select.getValue();
    var dataset_name = dataset_select.getLabel();

    hideErrorAndWarn();                     //Hide error message
    resource_select.clear();                // Remove old resources
    resource_select_title.innerHTML = 'Select the resource from the <strong>' + dataset_name + 
        '</strong> dataset that you want to be displayed';

    make_request(ckan_server + '/api/action/dataset_show?id=' + dataset_id, 'GET', insertResources, showError);
  }

  var resourceSelectChange = function() {
    hideErrorAndWarn();  //Hide error message
    make_request(ckan_server + '/api/action/datastore_search?limit=' + limit_rows + 
        '&resource_id=' + resource_select.getValue(), 'GET', pushResourceData, showError);
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

  var insertDatasets = function(response) {
    var response = JSON.parse(response.responseText);
    var datasets = response['result']['results']
    var entries = [];

    for (var i = 0; i < datasets.length; i++) {
      entries.push({label: datasets[i]['title'], value: datasets[i]['name']})
    }

    dataset_select.addEntries(entries);

    //Hide the add load more datasets button if we get less than MAX_ROWS records
    if (datasets.length < MAX_ROWS) {
      $(load_more).addClass('hidden');
    }

    //A selected resource means that a dataset is already chosen so we mustn't load a new one
    if (!resource_select.getValue()){
      datasetSelectChange();                //First call
    }
  }

  var insertResources = function(response) {
    var dataset = JSON.parse(response.responseText);
    var resources = dataset['result']['resources'];
    var entries = [];

    for (var i = 0; i < resources.length; i++) {
      var name = resources[i]['name'] == null ? resources[i]['id'] : resources[i]['name'];
      entries.push({label: name, value: resources[i]['id']})
    }

    resource_select.addEntries(entries);

    resourceSelectChange();               //First call
  }


  ///////////////////////////
  //SHOW/HIDE ERROR MESSAGE//
  ///////////////////////////

  var showWarn = function(msg) {
    warn.innerHTML = msg
    $(warn).removeClass('hidden');
  }

  var showError = function(e) {

    if (e && e.status && e.statusText) {
      error.innerHTML = e.status + ' - ' + e.statusText;
    } else {
      error.innerHTML = 'An error arises processing your request'
    }

    $(error).removeClass('hidden');
  }

  var hideErrorAndWarn = function(e) {
    $(error).addClass('hidden');
    $(warn).addClass('hidden');
  }


  ////////////////////////////////////////////////////
  //FUNCTION TO LOAD THE DATASETS OF A CKAN INSTANCE//
  ////////////////////////////////////////////////////

  var loadDataSets = function() {
    var start = page++ * MAX_ROWS;
    make_request(ckan_server + '/api/3/action/dataset_search?rows=' + MAX_ROWS + '&start=' + 
                 start, 'GET', insertDatasets, showError);
  }

  var loadInitialDataSets = function() {
    dataset_select.clear();               //Remove previous datasets
    resource_select.clear();              //Remove associated resources to the dataset
    resource_select_title.innerHTML = ''  //Remove dataset name
    hideErrorAndWarn();                   //Hide error message
    $(load_more).removeClass('hidden');   //Display the load_more button
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

    //Create the title
    title = document.createElement('h3');
    title.innerHTML = 'CKAN Instance DataSets ';
    layout.getCenterContainer().appendChild(title);

    // Update Icon
    var updateIcon = document.createElement('i');
    updateIcon.className = 'icon-refresh pointer-cursor';
    updateIcon.addEventListener('click', loadInitialDataSets.bind(this));
    title.appendChild(updateIcon);

    //Create the dataset select
    dataset_select = new StyledElements.StyledSelect({'class': 'full'});
    dataset_select.addEventListener('change', datasetSelectChange);
    layout.getCenterContainer().appendChild(dataset_select);

    //Create the button to add more datasets
    load_more = document.createElement('a');
    load_more.setAttribute('class', 'pointer-cursor')
    load_more.innerHTML = '<i class="icon-download"></i> Load more datasets...';
    load_more.addEventListener('click', loadDataSets.bind(this));
    layout.getCenterContainer().appendChild(load_more);

    //Create the resource title
    resource_select_title = document.createElement('p');
    layout.getCenterContainer().appendChild(resource_select_title);

    //Create the resource select
    resource_select = new StyledElements.StyledSelect({'class': 'full'});
    resource_select.addEventListener('change', resourceSelectChange);
    layout.getCenterContainer().appendChild(resource_select);

    //Create the error div
    error = document.createElement('div');
    error.setAttribute('class', 'alert alert-danger');
    layout.getCenterContainer().appendChild(error);

    //Create the warn div
    warn = document.createElement('div');
    warn.setAttribute('class', 'alert alert-warn');
    layout.getCenterContainer().appendChild(warn);

    //Create the bottom information info
    connection_info = document.createElement('p');
    set_connected_to();
    layout.getSouthContainer().appendChild(connection_info);

    //Repaint is needed
    layout.repaint();

    // Initial load
    loadInitialDataSets();

    MashupPlatform.widget.context.registerCallback(function (changes) {
      if ('widthInPixels' in changes || 'heightInPixels' in changes) {
        layout.repaint();
      }
    });
  }

  //Start the execution when the DOM is enterely loaded
  document.addEventListener('DOMContentLoaded', init.bind(this), true);

})();