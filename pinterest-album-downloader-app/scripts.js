const { app, dialog, getCurrentWindow  } = require('@electron/remote')
const request = require('request');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');
const fsExtra = require('fs-extra')

var list = [];
var input_url = "";
var name_url = "";
var name_album = "";
var board_id = "";
var destination_directory = "";

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById("submit-button").addEventListener("click", () => {
        startLoading();
    })
})

function getBoardId() {
  return new Promise(function(resolve, reject) {
      request.get(input_url, (error, response, data) => {
      let object = data.substring(data.search("__PWS_DATA__")-1);
      object = object.substring(object.search("\">")+2);
      object = object.slice(0, object.search("</script>"));
      object = JSON.parse(object);

      let boards = object.props.initialReduxState.boards;
      resolve(Object.keys(boards)[0]);
    })
  });
}

async function selectFolder() {
  return new Promise(function(resolve, reject) {
      let homeDir = app.getPath('home');
      let desktopDir = path.resolve(homeDir, 'Desktop');

      dialog.showOpenDialog( getCurrentWindow(), {
          title: "Select a folder",
          properties: ["openDirectory"],
          defaultPath: desktopDir
      }).then((fileNames) => {
          destination_directory = fileNames.filePaths[0];
          resolve();
      })
  });
}

async function startLoading() {
  await selectFolder();

  list = [];
  input_url = document.getElementById("url-input").value;
  name_url = input_url.replace(/^.*\/\/[^\/]+/, '');
  board_id = await getBoardId();
  let url = "https://www.pinterest.es/resource/BoardFeedResource/get/?source_url="+encodeURIComponent(input_url)+"&data=%7B%22options%22%3A%7B%22isPrefetch%22%3Afalse%2C%22board_id%22%3A%22"+board_id+"%22%2C%22board_url%22%3A%22"+encodeURIComponent(input_url)+"%22%2C%22field_set_key%22%3A%22react_grid_pin%22%2C%22filter_section_pins%22%3Atrue%2C%22sort%22%3A%22default%22%2C%22layout%22%3A%22default%22%2C%22page_size%22%3A250%2C%22redux_normalize_feed%22%3Atrue%2C%22no_fetch_context_on_resource%22%3Afalse%7D%2C%22context%22%3A%7B%7D%7D&_=1641065859000";
  
  request.get(url, (error, response, data) => {
      data = JSON.parse(data);
      name_album = getAlbumName(data);
      console.log("start",  process.cwd());
      if(data.resource_response) {
        addData(data);
        getNext(data.resource_response.bookmark);
      }
  });
}

function getNext(bookmark) {
    if(!bookmark) {
      finish();
      return;
    }

    console.log("page");

    let url = 'https://www.pinterest.es/resource/BoardFeedResource/get/?data=%7B%22options%22%3A%7B%22bookmarks%22%3A%5B%22' + bookmark.replace(/==/g, '%3D%3D%').replace(/=/g, '%3D%') + '22%5D%2C%22isPrefetch%22%3Afalse%2C%22board_id%22%3A%22'+board_id+'%22%2C%22board_url%22%3A%22'+encodeURIComponent(input_url)+'%22%2C%22field_set_key%22%3A%22react_grid_pin%22%2C%22filter_section_pins%22%3Atrue%2C%22sort%22%3A%22default%22%2C%22layout%22%3A%22default%22%2C%22page_size%22%3A250%2C%22redux_normalize_feed%22%3Atrue%2C%22no_fetch_context_on_resource%22%3Afalse%7D%2C%22context%22%3A%7B%7D%7D&_=1641065859000';
    request.get(url, (error, response, data) => {
      data = JSON.parse(data);
      if(data.resource_response) {
        addData(data);
        getNext(data.resource_response.bookmark);
      }
    });
}

function addData(data) {
  list = list.concat(data.resource_response.data.map((i, key) => {
    return {
        url: i && i.images ? i.images.orig.url : null,
        width: i && i.images ? i.images.orig.width : null,
        height: i && i.images ? i.images.orig.height : null,
        description: i.description,
        title: i.title,
        filename: (key+1) + ".jpg",
    }
  }));
}

function getAlbumName(data) {
    return data.resource_response.data[0].board.name.replace(/[/\\?%*:|"<>]/g, '-') ?? "";
}

function finish() {
    createDirectory();
    generateCSV();
    downloadImages();
}

function geFormattedDate() {
  let d = new Date();
  return ("0" + d.getDate()).slice(-2) + "-" + ("0"+(d.getMonth()+1)).slice(-2) + "-" + d.getFullYear();
}

function createDirectory() {
    let directory = `${destination_directory}\\${geFormattedDate()} ${name_album}`;
    if (!fs.existsSync(directory)){
      fs.mkdirSync(directory);
    } else {
      fsExtra.emptyDirSync(directory)
    }
}

function generateCSV() {
  let path = `${destination_directory}\\${geFormattedDate()} ${name_album}\\out.csv`;
  console.log(list);
  let csvWriter = createCsvWriter({
      path: path,
      header: [
        {id: 'title', title: 'title'},
        {id: 'description', title: 'description'},
        {id: 'filename', title: 'filename'},
        {id: 'url', title: 'url'},
        {id: 'height', title: 'height'},
        {id: 'width', title: 'width'},
      ]
  });

  csvWriter.writeRecords(list).then(()=> console.log('The CSV file was written successfully'));
}

var download = function(uri, filename, callback){
    request.head(uri, function(err, res, body){
        request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
    });
};

function downloadImages() {
    let directory = `${destination_directory}\\${geFormattedDate()} ${name_album}\\images`;
    if (!fs.existsSync(directory)){
      fs.mkdirSync(directory);
    }

    list.forEach((file, key) => {
        download(file.url, directory+`\\${file.filename}`, function(){
            console.log('done');
        });
    })
}