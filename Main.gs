"use strict";
var ser = []; // global to hold service credentials 

/**
 * Web app interface.
 */
function doGet(e) {
  var html = HtmlService.createTemplateFromFile('index');
  html.data = false;
  return html.evaluate().setTitle('Twitter Archive on Github Pages Setup');
}

/**
 * Helper function to include files in served HTML.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename)
      .getContent();
}

/**
 * function to update data files used in Twitter interface
 */
function updateArchive(){
  var properties = JSON.parse(PropertiesService.getUserProperties().getProperty('twgit_properties')) || {};
  var message = "";
  if (properties.git_repo && properties.git_repo.name && properties.git_repo.owner){
    // setup Github service/repo
    Github.setTokenService(function(){ return getGithubService_().getAccessToken();});
    Github.setRepo(properties.git_repo.owner, properties.git_repo.name);
    
    var newTree = [];
    
    var sub_dir = properties.git_repo.sub_dir || '';
    if (sub_dir !== '') {
      sub_dir += '/';
    }
    var branch = 'heads/master';
    var tree = []; // store a 
    
    var root_dir = Github.Repository.getContents({ref: branch}, sub_dir + 'data/js/');
    
    for (i in root_dir){ 
      var item = root_dir[i];
      if (item.type === "dir") {
        var tweets_path = item.path; // locate the tweets folder 
      } else {
        if (item.name === 'payload_details.js' || item.name === 'tweet_index.js' || item.name === 'user_details.js'){ 
          tree[item.name] = item.path; // hash map of name and path
          // as data files for web view are JS we grab these from github and eval to get the variables in tweet_index.js and payload_details.js
          eval(Github.Repository.getContentsByUrl(item.git_url)); 
        }
      }
    }
    
    var extraTweets = 0; // payload includes overall count which we'll update
    
    // get deatils of last file in archive
    var lastFileMeta = tweet_index[0];
    var file_path = lastFileMeta.file_name;
    var file_name = file_path.replace("data/js/tweets/","");
    var var_name = lastFileMeta.var_name;
    
    // prepare Grailbird which will hold last set of tweets archived
    var Grailbird = {};
    Grailbird.data = {};
    Grailbird.data[var_name] = [];
    
    // navigate to data/js/tweets/ and eval last archive file
    // first we get the git hub directory tree
    var tweet_dir = Github.Repository.getContents({ref: 'master'}, tweets_path)
    // filter by the file_name we need
    var git_file = tweet_dir.filter(filterByName.bind(this, file_name));
    // get the data by SHA (contents api method is limited to 1MB which is why getting as a blob                 
    var tweet_file = Utilities.newBlob(Utilities.base64Decode(Github.Repository.getBlob(git_file[0].sha).content)).getDataAsString();
    eval(tweet_file);
    
    // get id ofthe last tweet in archive
    var sinceid = Grailbird.data[var_name][0]['id_str'];
   
    // based on this get new data from Twitter API
    var newData = getNewStatusUpdates(sinceid, user_details.screen_name); 
    if (Object.keys(newData).length>0){
      // new data is returned in bins for each month newest first, we want to process oldest 1st so flip the keys
      var keys = [];
      for (var k in newData) {
        keys.unshift(k);
      }
      // for each date bin we need to either add to existing file or if new months add new data files
      for (var c = keys.length, n = 0; n < c; n++) {
        var i = keys[n];
        if (i == var_name){ // handling existing months
          Grailbird.data[var_name] = newData[i].concat(Grailbird.data[var_name]); // add new data 
          
          tweet_file = "Grailbird.data."+var_name+" = \n"+ JSON.stringify(Grailbird.data[var_name], null, '\t'); // make new file contents
          // push file to github
          newTree.push({"path": tweets_path + '/' + file_name,
                        "mode": "100644",
                        "type": "blob",
                        "sha" : Github.Repository.createBlob(tweet_file).sha});
                        
          extraTweets += newData[i].length; // running total of inserts
          tweet_index[0].tweet_count = Grailbird.data[var_name].length; // update tweet_index count for month
        } else { // creating files for new months
          var new_tweet_filename = i.toString().replace("tweets_","")+".js"; // recycle date bin name for filename maintaining tweets_yyyy_dd.js convention
          
          var new_tweet_file = "Grailbird.data."+i+" = \n"+ JSON.stringify(newData[i], null, '\t');  // make new file contents
           // push file to github
          newTree.push({"path": tweets_path + '/' + new_tweet_filename,
                        "mode": "100644",
                        "type": "blob",
                        "sha" : Github.Repository.createBlob(new_tweet_file).sha});
         // createBlob(new_tweet_file, repo, tweets_path + '/' + new_tweet_filename);
          
          extraTweets += newData[i].length; // running total of inserts
          var new_tweet_index_meta = {}; // build a new tweet_index record
          var tweetdate = new Date(newData[i][0].created_at);
          new_tweet_index_meta = { file_name: "data/js/tweets/"+new_tweet_filename,
                                  year: tweetdate.getYear(),
                                  var_name: i,
                                  tweet_count: newData[i].length,
                                  month: +Utilities.formatDate(tweetdate, "GMT", "MM") };
          tweet_index.unshift(new_tweet_index_meta); // insert at the beginning                           
        }
      }
      // finally update our tweet_index.js file
      var tweet_index_path = tree['tweet_index.js'];
      var new_tweet_index = "var tweet_index = "+JSON.stringify(tweet_index, null, '\t')
      newTree.push({"path": tweet_index_path,
                        "mode": "100644",
                        "type": "blob",
                        "sha" : Github.Repository.createBlob(new_tweet_index).sha});
      
      // and our payload_details.js files
      payload_details.tweets = payload_details.tweets + extraTweets; // update payload meta
      payload_details.created_at = Utilities.formatDate(new Date(), "GMT", "E MMM dd HH:mm:ss Z yyyy"); // new date stamp
      
      var payload_details_path = tree['payload_details.js'];
      var new_payload_details = "var payload_details = "+JSON.stringify(payload_details, null, '\t');
      newTree.push({"path": payload_details_path,
                        "mode": "100644",
                        "type": "blob",
                        "sha" : Github.Repository.createBlob(new_payload_details).sha});
      
      // at this point we posted new files to github but we still need to commit them
      // using http://patrick-mckinley.com/tech/github-api-commit.html as ref for this process
      
      // 1. Get the SHA of the latest commit on the branch
      var initialCommitSha = Github.Repository.getRef(branch).object.sha;
      
      // 2. Get the tree information for that commit
      var initialTreeSha = Github.Repository.getCommit(initialCommitSha).tree.sha;
      
      // 3. Create a new tree for your commit
      var newTreeSha = Github.Repository.createTree(newTree, initialTreeSha).sha; 
      
      // 4. Create the commit
      var newCommitSha = Github.Repository.commit(initialCommitSha, newTreeSha, "Added "+extraTweets+ " tweets").sha;                
      
      // 5. Link commit to the reference
      var commitResponse = Github.Repository.updateHead(branch, newCommitSha, false);
      
      message =  "Added "+extraTweets+ " tweets... ";
    } else { 
      message = "Updated No tweets added... "
    }
  }
  properties.last_run = new Date();
  PropertiesService.getUserProperties().setProperty('twgit_properties', JSON.stringify(properties));
  return JSON.stringify({text: message,
                         last_run: properties.last_run}); 
}

function filterByName(filename, el){
  return el.name == filename
}

/**
 * Get new status updates from Twitter 
 * @param {String} sinceid of last tweet in archive.
 * @param {String} screen_name of archived account.
 * @return {Object} json object of Twitter updates binned in month objects yyyy_mm.
 */
function getNewStatusUpdates(sinceid, screen_name){
  // some parameters used in the query
  var params = {  screen_name: screen_name,
                  count: 200,
                  since_id: sinceid,
                  include_rts: true,
                  tweet_mode: 'extended' };
  
  // some variables
  var page = 1;
  var done = false;
  var output = {};
  var max_id = "";
  var max_id_url = "";
  while(!done){
    var data = twitterFetch_("GET", "statuses/user_timeline.json", params); // get the data from twitter
    if (data.length>0){ // if data returned
      if (data.length == 1 && data[0].id_str == max_id){ // catching if we've reached last new tweet
        done = true;
        break;
      }
      for (i in data){ // for the data returned we put in montly bins ready for writting/updating files
        if(data[i].id_str != max_id){
          var timestamp = new Date(data[i].created_at);
          if (data[i]["retweeted_status"]) {
            var existing_id_str = data[i].id_str
            data[i] = data[i]["retweeted_status"];
            data[i].id_str = existing_id_str;
          } 
          data[i]["text"] = data[i]["full_text"];
          var bin = "tweets_"+Utilities.formatDate(timestamp, "GMT", "yyyy_MM");
          if (output[bin] == undefined) {
            output[bin] = []; // if bin hasn't been used yet make it
          }
          output[bin].push(data[i]); //push data to date bin
        }
        if (data[data.length-1].id_str != max_id) { // more bad code trying to work out if next call with a max_id
          max_id = data[data.length-1].id_str;
          params.max_id = max_id;
        }
      }
      
    } else { // if not data break the loop
      done = true;
    }
    page ++
    if (page > 16) done = true; // if collected 16 pages (the max) break the loop
  }
  return output;
}

/**
 * Gets a static script property, using long term caching.
 * @param {string} key The property key.
 * @returns {string} The property value.
 */
function getStaticScriptProperty_(key) {
  var value = CacheService.getScriptCache().get(key);
  if (!value) {
    value = PropertiesService.getScriptProperties().getProperty(key);
    CacheService.getScriptCache().put(key, value, 21600);
  }
  return value;
}

function clearProp(){
  PropertiesService.getUserProperties().deleteProperty('twgit_properties')
}