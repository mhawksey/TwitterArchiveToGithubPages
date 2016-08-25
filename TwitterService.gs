var TWBASEURL_ = 'https://api.twitter.com/1.1/';

ser['twitter'] = { consumerKey  : getStaticScriptProperty_('tw_consumerKey') || null, 
                 consumerSecret : getStaticScriptProperty_('tw_consumerSecret') || null,
                 propertyStore  : PropertiesService.getUserProperties(),
                 serviceProvider: { name                : "twitter",
                                    requestTokenURL     : "https://api.twitter.com/oauth/request_token",
                                    userAuthorizationURL: "https://api.twitter.com/oauth/authorize", 
                                    accessTokenURL      : "https://api.twitter.com/oauth/access_token",
                                    projectKey          : "1E3MlTiAgsjVHdSExaYoOCd0-WEXwKAJGpB8Pjd8ReALs2JxN0aGVtST7"},
              };

function getTwitterService_() {
  var service_name = "twitter";
  return OAuth1.createService(ser[service_name].serviceProvider.name)
               .setAccessTokenUrl(ser[service_name].serviceProvider.accessTokenURL)
               .setRequestTokenUrl(ser[service_name].serviceProvider.requestTokenURL)
               .setAuthorizationUrl(ser[service_name].serviceProvider.userAuthorizationURL)
               .setConsumerKey(ser[service_name].consumerKey)
               .setConsumerSecret(ser[service_name].consumerSecret)
               .setProjectKey(ser[service_name].serviceProvider.projectKey)
               .setCallbackFunction('authCallbackTw')
               .setPropertyStore(ser[service_name].propertyStore);
}

/**
* Generate Twitter authorisation url.
*
* @return {string} authorisation url (link for user to start twitter authentication).
*/
function getTwitterAuthURL(){
  var twitterService = getTwitterService_();
  var authorizationUrl = twitterService.authorize();
  Logger.log(authorizationUrl);
  return '<a href="'+authorizationUrl+'"><button class="ui twitter button"><i class="fa fa-twitter icon"></i>Sign in with Twitter</button></a>'
}



/**
* Handles the OAuth callback..
*
* @param {Object} request object from Twitter callback
* @param {string} stepTemplate The template file to render
*/
function authCallbackTw(e) {
  var twitterService = getTwitterService_();
  var isAuthorized = twitterService.handleCallback(e);
  var html = HtmlService.createTemplateFromFile('index');
  if (isAuthorized) {
    html.data = {message: 'Successfully connected to Twitter.',
                 success: true,
                 service: 'twitter'};
  } else {
    html.data = {message: 'Hmm something went wrong ...',
                 success: false,
                 service: 'twitter'};
  }
  return html.evaluate().setTitle('Twitter Archive on Github Pages Setup');
}

/**
* Handle API request to Twitter.
* @param {string} method - the method for the request (GET, PUT, POST, DELETE)
* @param {string} path - the path for the request
* @param {Object} params - for Twitter API query
* @return {Object} response.
*/
function twitterFetch_(method, path, params, raw) {
  var twitterService = getTwitterService_();
  
  var url = path;
  
  if (path.indexOf('https://') !== 0 && path.indexOf('http://') !== 0) {
    url = TWBASEURL_ + path;
  } 
  
  var config = {
    method: method,
    muteHttpExceptions: true,
    contentType: "application/json"
  }

  url = buildUrl_(url, params);
  
  try {
    var f = twitterService.fetch(url);
    if (f.getResponseCode() === 429){
      throw "Twitter rate limit exceeded";
    }
    return JSON.parse(f.getContentText());
  } catch(e) {
    return e;
  }
}

/**
 * Builds a complete URL from a base URL and a map of URL parameters. Adapted from Eric Koleda's OAuth2 Lib.
 * @param {string} url The base URL.
 * @param {Object.<string, string>} params The URL parameters and values.
 * @returns {string} The complete URL.
 * @private
 */
function buildUrl_(url, params) {
  var params = params || {}; //allow for NULL options
  var paramString = Object.keys(params).map(function(key) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
  }).join('&');
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + paramString;
}
