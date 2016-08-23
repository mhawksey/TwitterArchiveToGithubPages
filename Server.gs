/**
* Part of index.html to return completed steps and any log in buttons.
* @return {Object} - steps completed
*/
function getCompletedSteps(){
  var properties = JSON.parse(PropertiesService.getUserProperties().getProperty('twgit_properties')) || {};
  var steps = { icons: {'twitter': 'fa-twitter',
               'github': 'fa-github',
               'folder-open': 'fa-folder-open',
               'clock-o': 'fa-clock-o'},
               links: {}};
  
  if (getTwitterService_().hasAccess()){
    steps.icons['twitter'] = 'completed'
    steps.links['twitter'] = '<button id="twitter_signout" class="ui twitter button"><i class="fa fa-twitter icon"></i>Disconnect Twitter</button>';
  } else {
    steps.links['twitter'] = getTwitterAuthURL();
  }
  if (getGithubService_().hasAccess()){
    steps.icons['github'] = 'completed'
    steps.links['github'] = '<button id="github_signout" class="ui github button"><i class="fa fa-github icon"></i>Disconnect Github</button>';
  } else {
    steps.links['github'] = getGithubAuthURL();
  }
  if (properties.git_repo && properties.git_repo.name){
    steps.icons['folder-open'] = 'completed';
  }
  if (properties.trigger && properties.trigger.id){
    steps.icons['clock-o'] = 'completed';
  }
  return steps;
}

/**
* Gets list of Github users repositories.
* @return {Object} - repos from Github
*/
function getRepoList(){
  var properties = JSON.parse(PropertiesService.getUserProperties().getProperty('twgit_properties')) || {};
  Github.setTokenService(function(){ return getGithubService_().getAccessToken();});
  
  if (!properties.git_repo || (properties.git_repo && !properties.git_repo.owner)){
    properties.git_repo = {owner: Github.User.getProfile().login};
    PropertiesService.getUserProperties().setProperty('twgit_properties', JSON.stringify(properties));
  } 
  
  var items_list = Github.User.listRepos({sort:'created', direction:'desc'});
  items_list = items_list.filter(function (el) {
                           return el.owner.login == properties.git_repo.owner} );
  var repo = {items: items_list,
              git_repo: properties.git_repo || false }; 
  return repo;
}

/**
* Gets trigger options.
* @return {Object} - triggers
*/
function getClock(){
  var properties = JSON.parse(PropertiesService.getUserProperties().getProperty('twgit_properties')) || {};
  var clock = {options: {clock: ['Never', 'Hourly', 'Daily'],
                         clock_hour: ['12am', '1am', '2am', '3am', '4am', '5am', '6am', '7am', '8am', '9am', 
                                      '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm', 
                                      '8pm', '9pm', '10pm', '11pm']},
               clock: properties.trigger || false,
               last_run: properties.last_run || 'never'}; 
  return clock;
}

/**
 * Reset the authorization state, so that it can be re-tested.
 */
function disconnectTwitter(){
  getTwitterService_().reset();
  processClockForm(false);
  return getCompletedSteps();
}

/**
 * Reset the authorization state, so that it can be re-tested.
 */
function disconnectGithub() {
  getGithubService_().reset();
  processRepoForm(false)
  processClockForm(false);
  return getCompletedSteps();
}

/**
* Handles repo selection
*
* @param {Object} formObject
* @param {string} message for nag
*/
function processRepoForm(formObject) {
  var properties = JSON.parse(PropertiesService.getUserProperties().getProperty('twgit_properties')) || {};
  properties.git_repo.name = formObject.repo || false;
  properties.git_repo.sub_dir = formObject.sub_dir || '';

  
  PropertiesService.getUserProperties().setProperty('twgit_properties', JSON.stringify(properties));
  return JSON.stringify({text: "Repository settings saved"});
}

/**
* Handles trigger selection.
*
* @param {Object} formObject
* @param {string} message for nag
*/
function processClockForm(formObject) {
  var properties = JSON.parse(PropertiesService.getUserProperties().getProperty('twgit_properties')) || {};
  var trigger = properties.trigger || false;
  if(trigger && trigger.id){
    var script_triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < script_triggers.length; i++) {
      if (script_triggers[i].getUniqueId() === trigger.id){
        ScriptApp.deleteTrigger(script_triggers[i]);
        break;
      }
    }
  }
  var trigger = {clock: formObject.clock || 'Never',
                  clock_hour: formObject.clock_hour || ''};
  if(trigger.clock == "Daily" || trigger.clock == "Hourly"){
    if (trigger.clock === "Daily"){
      var clock = getClock();
      trigger.id = ScriptApp.newTrigger("updateArchive")
                             .timeBased()
                             .atHour(clock.options.clock_hour.indexOf(trigger.clock_hour))
                             .everyDays(1)
                             .create()
                             .getUniqueId();              
    }
    if (trigger.clock === "Hourly"){
      trigger.id = ScriptApp.newTrigger("updateArchive")
                             .timeBased()
                             .everyHours(1)
                             .create()
                             .getUniqueId();
    }
  } else {
    trigger.clock_hour = '';
  }
  
  properties.trigger = trigger;
  PropertiesService.getUserProperties().setProperty('twgit_properties', JSON.stringify(properties));
  return JSON.stringify({text: "Trigger saved"});
}