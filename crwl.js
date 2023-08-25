const request = require("request");
const util = require("util");
const rp = util.promisify(request);
const sleep = util.promisify(setTimeout);
const cheerio = require('cheerio');
const { URL } = require('url');

let seenLinks = {};

let rootNode = {};
let currentNode = {};

let linksQueue = [];
let printList = [];

let previousDepth = 0;
let maxCrawlingDepth = 5;

let options = null;
let mainDomain = null;
let mainParsedUrl = null;

class CreateLink {
  constructor(linkURL, depth, parent) {
    this.url = linkURL;
    this.depth = depth;
    this.parent = parent;
    this.children = [];
  }
}
//your scraping bot credentials
let username = "sarthakturkar",
    apiKey = "jynVUdT1z6KGr6tFb9cnK3CeA",
    apiEndPoint = "http://api.scraping-bot.io/scrape/raw-html",
    auth = "Basic " + Buffer.from(username + ":" + apiKey).toString("base64");

let requestOptions = {
  method: 'POST',
  url: apiEndPoint,
  json: {
    url: "this will be replaced in the findLinks function",
    //scraping-bot options
      options: {
          useChrome:false, //if you want to use headless chrome WARNING two api calls will be consumed for this option
          premiumProxy:false, //if you want to use premium proxies Unblock Amazon,linkedIn (consuming 10 calls)
      }
  },
  headers: {
      Accept: 'application/json',
      Authorization : auth
  }
}

//Start Application put here the address where you want to start your crawling with
//second parameter is depth with 1 it will scrape all the links found on the first page but not the ones found on other pages
//if you put 2 it will scrape all links on first page and all links found on second level pages be careful with this on a huge website it will represent tons of pages to scrape
// it is recommended to limit to 5 levels
crawlBFS("https://github.com/sarthakturkar75/geospatial/", 1);

async function crawlBFS(startURL, maxDepth = 5) {
  try {
    mainParsedUrl = new URL(startURL);
  } catch (e) {
    console.log("URL is not valid", e);
    return;
  }

  mainDomain = mainParsedUrl.hostname;

  maxCrawlingDepth = maxDepth;
  startLinkObj = new CreateLink(startURL, 0, null);
  rootNode = currentNode = startLinkObj;
  addToLinkQueue(currentNode);
  await findLinks(currentNode);
}

//
async function crawl(linkObj) {
  //Add logs here if needed!
  console.log(`Checking URL: ${options.url}`);
  await findLinks(linkObj);
}

//The goal is to get the HTML and look for the links inside the page.
async function findLinks(linkObj) {
  //lets set the url we want to scrape
  requestOptions.json.url = linkObj.url
  console.log("Scraping URL : " + linkObj.url);
  let response
  try {
    response = await rp(requestOptions);
    if (response.statusCode !== 200) {
      if (response.statusCode === 401 || response.statusCode === 405) {
        console.log("authentication failed check your credentials");
      } else {
        console.log("an error occurred check the URL" + response.statusCode, response.body);
      }
      return 
    }
    //response.body is the whole content of the page if you want to store some kind of data from the web page you should do it here
    let $ = cheerio.load(response.body);
    let links = $('body').find('a').filter(function (i, el) {
      return $(this).attr('href') != null;
    }).map(function (i, x) {
      return $(this).attr('href');
    });
    if (links.length > 0) {
      links.map(function (i, x) {
        let reqLink = checkDomain(x);
        if (reqLink) {
          if (reqLink != linkObj.url) {
            newLinkObj = new CreateLink(reqLink, linkObj.depth + 1, linkObj);
            addToLinkQueue(newLinkObj);
          }
        }
      });
    } else {
      console.log("No more links found for " + requestOptions.url);
    }
    let nextLinkObj = getNextInQueue();
    if (nextLinkObj && nextLinkObj.depth <= maxCrawlingDepth) {
      //random sleep
      //It is very important to make this long enough to avoid spamming the website you want to scrape
      //if you choose a short time you will potentially be blocked or kill the website you want to crawl
      //time is in milliseconds here
      let minimumWaitTime = 500; //half a second these values are very low on a real worl example you should use at least 30000 (30 seconds between each call) 
      let maximumWaitTime = 10000 //max fifty seconds
      let waitTime = Math.round(minimumWaitTime + (Math.random() * (maximumWaitTime-minimumWaitTime)));
      console.log("wait for " + waitTime + " milliseconds");
      await sleep(waitTime);
      //next url scraping
      await crawl(nextLinkObj);
    } else {
      setRootNode();
      printTree();
    }
  } catch (err) {
    console.log("Something Went Wrong...", err);
  }
}

//Go all the way up and set RootNode to the parent node
function setRootNode() {
  while (currentNode.parent != null) {
    currentNode = currentNode.parent;
  }
  rootNode = currentNode;
}

function printTree() {
  addToPrintDFS(rootNode);
  console.log(printList.join("\n|"));
}

function addToPrintDFS(node) {
  let spaces = Array(node.depth * 3).join("-");
  printList.push(spaces + node.url);
  if (node.children) {
    node.children.map(function (i, x) {
      {
        addToPrintDFS(i);
      }
    });
  }
}

//Check if the domain belongs to the site being checked
function checkDomain(linkURL) {
  let parsedUrl;
  let fullUrl = true;
  try {
    parsedUrl = new URL(linkURL);
  } catch (error) {
    fullUrl = false;
  }
  if (fullUrl === false) {
    if (linkURL.indexOf("/") === 0) {
      //relative to domain url
      return mainParsedUrl.protocol + "//" + mainParsedUrl.hostname + linkURL.split("#")[0];
    } else if (linkURL.indexOf("#") === 0) {
      //anchor avoid link
      return
    } else {
      //relative url
      let path = currentNode.url.match('.*\/')[0]
      return path + linkURL;
    }
  }

  let mainHostDomain = parsedUrl.hostname;

  if (mainDomain == mainHostDomain) {
    console.log("returning Full Link: " + linkURL);
    parsedUrl.hash = "";
    return parsedUrl.href;
  } else {
    return;
  }
}

function addToLinkQueue(linkobj) {
  if (!linkInSeenListExists(linkobj)) {
    if (linkobj.parent != null) {
      linkobj.parent.children.push(linkobj);
    }
    linksQueue.push(linkobj);
    addToSeen(linkobj);
  }
}

function getNextInQueue() {
  let nextLink = linksQueue.shift();
  if (nextLink && nextLink.depth > previousDepth) {
    previousDepth = nextLink.depth;
    console.log(`------- CRAWLING ON DEPTH LEVEL ${previousDepth} --------`);
  }
  return nextLink;
}

function peekInQueue() {
  return linksQueue[0];
}

//Adds links we've visited to the seenList
function addToSeen(linkObj) {
  seenLinks[linkObj.url] = linkObj;
}

//Returns whether the link has been seen.
function linkInSeenListExists(linkObj) {
  return seenLinks[linkObj.url] == null ? false : true;
}