Zotero.Jasminum = {
    init: function () {
        // // Register the callback in Zotero as an item observer
        // var notifierID = Zotero.Notifier.registerObserver(
        //   Zotero.Jasminum.notifierCallback,
        //   ["item"]
        // );
        // // Unregister callback when the window closes (important to avoid a memory leak)
        // window.addEventListener(
        //   "unload",
        //   function (e) {
        //     Zotero.Notifier.unregisterObserver(notifierID);
        //   },
        //   false
        // );
        Zotero.debug("Init Jasminum ...");
    },

    notifierCallback: {
        // Check new added item, and adds meta data.
        // TODO Add a check function here
        notify: function (event, type, ids, extraData) {
            // var automatic_pdf_download_bool = Zotero.Prefs.get('zoteroscihub.automatic_pdf_download');
            if (event == "add") {
                suppress_warnings = true;
                Zotero.Jasminum.updateItems(
                    Zotero.Items.get(ids),
                    suppress_warnings
                );
            }
        },
    },

    displayMenuitem: function () {
        var pane = Services.wm.getMostRecentWindow("navigator:browser")
            .ZoteroPane;
        var items = pane.getSelectedItems();
        Zotero.debug("**Jasminum selected item length: " + items.length);
        var show_menu = items.some((item) => Zotero.Jasminum.checkItem(item));
        pane.document.getElementById(
            "zotero-itemmenu-jasminum"
        ).hidden = !show_menu;
        pane.document.getElementById(
            "id-jasminum-separator"
        ).hidden = !show_menu;
        Zotero.debug("**Jasminum show menu: " + show_menu);
    },

    updateSelectedEntity: function (libraryId) {
        Zotero.debug("**Jasminum Updating items in entity");
        if (!ZoteroPane.canEdit()) {
            ZoteroPane.displayCannotEditLibraryMessage();
            return;
        }

        var collection = ZoteroPane.getSelectedCollection(false);

        if (collection) {
            Zotero.debug(
                "**Jasminum Updating items in entity: Is a collection == true"
            );
            var items = [];
            collection.getChildItems(false, false).forEach(function (item) {
                items.push(item);
            });
            suppress_warnings = true;
            Zotero.Jasminum.updateItems(items, suppress_warnings);
        }
    },

    updateSelectedItems: function () {
        Zotero.debug("**Jasminum Updating Selected items");
        suppress_warnings = false;
        Zotero.Jasminum.updateItems(
            ZoteroPane.getSelectedItems(),
            suppress_warnings
        );
    },

    checkItem: function (item) {
        // Return true, when item is OK for update cnki data.
        if (
            !item.isAttachment() ||
            item.isRegularItem() ||
            !item.isTopLevelItem()
        ) {
            return false;
        }

        var filename = item.getFilename();
        // Find Chinese characters in string
        if (escape(filename).indexOf("%u") < 0) return false;
        // Extension should be CAJ or PDF
        var ext = filename.substr(filename.length - 3, 3);
        if (ext != "pdf" && ext != "caj") return false;
        return true;
    },

    splitFilename: function (filename) {
        // Make query parameters from filename
        var prefix = filename.substr(0, filename.length - 4);
        var prefixArr = prefix.split("_");
        return {
            author: prefixArr[prefixArr.length - 1],
            keyword: prefixArr.slice(0, prefixArr.length - 1).join(" "),
        };
    },

    createPost: function (fileData) {
        // Create a search string.
        static_post_data = {
            action: "",
            NaviCode: "*",
            ua: "1.21",
            isinEn: "1",
            PageName: "ASP.brief_result_aspx",
            DbPrefix: "SCDB",
            DbCatalog: "中国学术期刊网络出版总库",
            ConfigFile: "SCDB.xml",
            db_opt: "CJFQ,CDFD,CMFD,CPFD,IPFD,CCND,CCJD",
            year_type: "echar",
            CKB_extension: "ZYW",
            txt_1_sel: "SU$%=|",
            txt_1_value1: fileData.keyword,
            txt_1_relation: "#CNKI_AND",
            txt_1_special1: "=",
            au_1_sel: "AU",
            au_1_sel2: "AF",
            au_1_value1: fileData.author,
            au_1_special1: "=",
            au_1_special2: "%",
            his: "0",
            __: Date() + " (中国标准时间)",
        };
        var urlEncodedDataPairs = [];
        for (name in static_post_data) {
            urlEncodedDataPairs.push(
                encodeURIComponent(name) +
                    "=" +
                    encodeURIComponent(static_post_data[name])
            );
        }
        return urlEncodedDataPairs.join("&").replace(/%20/g, "+");
    },

    selectRow: function (rowSelectors) {
        Zotero.debug("**Jasminum select window start");
        var io = { dataIn: rowSelectors, dataOut: null };
        var newDialog = window.openDialog(
            "chrome://zotero/content/ingester/selectitems.xul",
            "_blank",
            "chrome,modal,centerscreen,resizable=yes",
            io
        );
        return io.dataOut;
    },

    getIDFromUrl: function (url) {
        if (!url) return false;
        // add regex for navi.cnki.net
        var dbname = url.match(/[?&](?:db|table)[nN]ame=([^&#]*)/i);
        var filename = url.match(/[?&]filename=([^&#]*)/i);
        if (
            !dbname ||
            !dbname[1] ||
            !filename ||
            !filename[1] ||
            dbname[1].match("TEMP$")
        )
            return false;
        return { dbname: dbname[1], filename: filename[1] };
    },

    parseRef: function (targetID) {
        var postData =
            "formfilenames=" +
            encodeURIComponent(
                targetID.dbname + "!" + targetID.filename + "!1!0,"
            ) +
            "&hid_kLogin_headerUrl=/KLogin/Request/GetKHeader.ashx%3Fcallback%3D%3F" +
            "&hid_KLogin_FooterUrl=/KLogin/Request/GetKHeader.ashx%3Fcallback%3D%3F" +
            "&CookieName=FileNameS";
    },

    searchPrepare: function (fileData) {
        var searchData = Zotero.Jasminum.createPost(fileData);
        var SEARCH_HANDLE_URL =
            "https://kns.cnki.net/kns/request/SearchHandler.ashx";
        var url = SEARCH_HANDLE_URL + "?" + searchData;
        Zotero.debug("**Jasminum start prepare");
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url);
            xhr.onload = function () {
                if (this.status === 200) {
                    resolve(xhr.response);
                } else {
                    reject({
                        status: this.status,
                        statusText: xhr.statusText,
                    });
                }
            };
            xhr.onerror = function () {
                reject({
                    status: this.status,
                    statusText: xhr.statusText,
                });
            };
            xhr.send();
        });
    },

    search: function (searchPrepareout, fileData) {
        Zotero.debug("**Jasminum start search");
        var keyword = encodeURI(fileData.keyword);
        Zotero.debug(searchPrepareout);
        Zotero.debug("**Jasminum  keyword: " + keyword);
        var resultUrl =
            "https://kns.cnki.net/kns/brief/brief.aspx?pagename=" +
            searchPrepareout +
            `&t=${Date.parse(new Date())}&keyValue=${keyword}&S=1&sorttype=`;
        Zotero.debug(resultUrl);
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", resultUrl);
            xhr.onload = function () {
                if (this.status === 200) {
                    var targetRow = Zotero.Jasminum.getSearchItems(
                        xhr.response
                    );
                    Zotero.debug(targetRow.textContent);
                    resolve(targetRow);
                } else {
                    reject({
                        status: this.status,
                        statusText: xhr.statusText,
                    });
                }
            };
            xhr.onerror = function () {
                reject({
                    status: this.status,
                    statusText: xhr.statusText,
                });
            };
            xhr.send();
        });
    },

    getSearchItems: function (resptext) {
        Zotero.debug("**Jasminum get item from search");
        var parser = new DOMParser();
        var html = parser.parseFromString(resptext, "text/html");
        var rows = html.querySelectorAll("table.GridTableContent > tbody > tr");
        Zotero.debug("**Jasminum 搜索结果：" + (rows.length - 1));
        var targetRow;
        if (rows.length <= 1) {
            Zotero.debug("**Jasminum No items found.");
            return null;
        } else if (rows.length == 2) {
            targetRow = rows[1];
        } else {
            // Get the right item from search result.
            var rowIndicators = {};
            for (let idx = 1; idx < rows.length; idx++) {
                var rowText = rows[idx].textContent.split(/\s+/).join(" ");
                rowIndicators[idx] = rowText;
                Zotero.debug(rowText);
            }
            var targetIndicator = Zotero.Jasminum.selectRow(rowIndicators);
            // Zotero.debug(targetIndicator);
            // No item selected, return null
            if (!targetIndicator) return null;
            targetRow = rows[Object.keys(targetIndicator)[0]];
        }
        // Zotero.debug(targetRow.textContent);
        return targetRow;
    },

    getRefworks: function (targetRow) {
        Zotero.debug("**Jasminum start get ref");
        return new Promise(function (resolve, reject) {
            if (targetRow == null) {
                reject(new Error("No items returned from the CNKI"));
            }

            var targetUrl = targetRow.getElementsByClassName("fz14")[0].href;
            var targetID = Zotero.Jasminum.getIDFromUrl(targetUrl);
            Zotero.debug(targetID);
            // Get reference data from CNKI by ID.
            var postData =
                "formfilenames=" +
                encodeURIComponent(
                    targetID.dbname + "!" + targetID.filename + "!1!0,"
                ) +
                "&hid_kLogin_headerUrl=/KLogin/Request/GetKHeader.ashx%3Fcallback%3D%3F" +
                "&hid_KLogin_FooterUrl=/KLogin/Request/GetKHeader.ashx%3Fcallback%3D%3F" +
                "&CookieName=FileNameS";
            var request = new XMLHttpRequest();
            request.open(
                "GET",
                "https://kns.cnki.net/kns/ViewPage/viewsave.aspx?displayMode=Refworks&" +
                    postData,
                true
            );
            request.onload = onload;
            request.onerror = onerror;
            request.onprogress = onprogress;
            request.send();

            function onload() {
                if (request.status === 200) {
                    var resp = request.responseText;
                    // Zotero.debug(resp);
                    var parser = new DOMParser();
                    var html = parser.parseFromString(resp, "text/html");
                    var data = Zotero.Utilities.xpath(
                        html,
                        "//table[@class='mainTable']//td"
                    )[0]
                        .innerHTML.replace(/<br>/g, "\n")
                        .replace(
                            /^RT\s+Conference Proceeding/gim,
                            "RT Conference Proceedings"
                        )
                        .replace(
                            /^RT\s+Dissertation\/Thesis/gim,
                            "RT Dissertation"
                        )
                        .replace(/^(A[1-4]|U2)\s*([^\r\n]+)/gm, function (
                            m,
                            tag,
                            authors
                        ) {
                            authors = authors.split(/\s*[;，,]\s*/); // that's a special comma
                            if (!authors[authors.length - 1].trim())
                                authors.pop();
                            return tag + " " + authors.join("\n" + tag + " ");
                        });
                    Zotero.debug(data);
                    resolve(data);
                } else {
                    reject(
                        new Error(
                            "Get Reference Status code was " + request.status
                        )
                    );
                }
            }

            function onerror() {
                reject(new Error("Can't XHR " + JSON.stringify(url)));
            }
        });
    },

    promiseTranslate: async function (translate, libraryID) {
        Zotero.debug("** Jasminum translate begin ...");
        translate.setHandler("select", function (translate, items, callback) {
            for (let i in items) {
                let obj = {};
                obj[i] = items[i];
                callback(obj);
                return;
            }
        });

        translate.setHandler("itemDone", function (translate, newItem) {
            Zotero.debug("** Jasminum start fix item ..");
            Zotero.debug(newItem);
            var creators = newItem.creators;
            for (var key in newItem) {
                Zotero.debug(key);
            }
            Zotero.debug("**Jasminum 作者数目：" + creators.length);

            for (var i = 0, n = creators.length; i < n; i++) {
                var creator = creators[i];
                Zotero.debug(creator);
                Zotero.debug(creator.lastName);
                if (creator.firstName) continue;

                var lastSpace = creator.lastName.lastIndexOf(" ");
                if (
                    creator.lastName.search(/[A-Za-z]/) !== -1 &&
                    lastSpace !== -1
                ) {
                    // western name. split on last space
                    creator.firstName = creator.lastName.substr(0, lastSpace);
                    creator.lastName = creator.lastName.substr(lastSpace + 1);
                } else {
                    // Chinese name. first character is last name, the rest are first name
                    Zotero.debug("Chinese");
                    creator.firstName = creator.lastName.substr(1);
                    creator.lastName = creator.lastName.charAt(0);
                }
                Zotero.debug(creator);
                creators[i] = creator;
            }
            Zotero.debug(creators);
            newItem.creators = creators;

            // Clean up abstract
            if (newItem.abstractNote) {
                newItem.abstractNote = newItem.abstractNote
                    .replace(/\s*[\r\n]\s*/g, "\n")
                    .replace(/&lt;.*?&gt;/g, "");
            }
            // Remove wront CN field and set library catalog..
            newItem.callNumber = "";
            newItem.libraryCatalog = "CNKI";
            Zotero.debug(newItem);
            Zotero.debug("** Jasminum fix item end.");
        });

        let newItems = translate.translate({
            libraryID: libraryID,
            saveAttachments: false,
        });
        if (newItems.length) {
            Zotero.debug(newItems[0]);
            Zotero.debug("** Jasminum translate end.");
            return newItems[0];
        }
        throw new Error("No items found");
    },

    updateItems: async function (items, suppress_warnings) {
        var zp = Zotero.getActiveZoteroPane();
        if (items.length == 0) return;
        var selectParent = true ? items.length === 1 : false;
        var item = items.shift();
        var itemCollections = item.getCollections();
        var libraryID = item.libraryID;
        if (!Zotero.Jasminum.checkItem(item)) return;
        var fileData = Zotero.Jasminum.splitFilename(item.getFilename());
        var searchPrepareout = await Zotero.Jasminum.searchPrepare(fileData);
        // Zotero.debug(searchPrepareout);
        var targetRow = await Zotero.Jasminum.search(
            searchPrepareout,
            fileData
        );
        var data = await Zotero.Jasminum.getRefworks(targetRow);
        var translate = new Zotero.Translate.Import();
        translate.setTranslator("1a3506da-a303-4b0a-a1cd-f216e6138d86");
        translate.setString(data);
        var newItem = await Zotero.Jasminum.promiseTranslate(
            translate,
            libraryID
        );
        Zotero.debug(newItem);
        // newItem = Zotero.Jasminum.fixItem(newItem);
        Zotero.debug("**Jasminum DB trans ...");
        Zotero.DB.executeTransaction(async function () {
            if (itemCollections.length) {
                for (let collectionID of itemCollections) {
                    newItem.addToCollection(collectionID);
                }
                await newItem.save();
            }

            // Put old item as a child of the new item
            item.parentID = newItem.id;
            await item.save();
        });
        if (items.length) {
            Zotero.Jasminum.updateItems(items, suppress_warnings);
        }
        Zotero.debug("** Jasminum finished.");
        Zotero.debug(newItem);
        // Zotero.Jasminum.fixItem(newItem);
        //await zp.selectItem(newItem.id);
    },

    checkItemPDF: function(item) {
        return item.attachmentContentType 
            && item.attachmentContentType === 'application/pdf'
            && escape(item.getFilename()).indexOf("%u") < 0;  // Contain Chinese
    },

    addBookmarkPDF: async function(items) {
        // demo url     https://kreader.cnki.net/Kreader/buildTree.aspx?dbCode=cdmd&FileName=1020622678.nh&TableName=CMFDTEMP&sourceCode=GHSFU&date=&year=2020&period=&fileNameList=&compose=&subscribe=&titleName=&columnCode=&previousType=_&uid=
        if (items.length == 0) return;
        var item = items.shift();
        var parentItem = item.parentItem;
        var parentItemType = parentItem.getField('itemType');
        var itemUrl = '';
        var itemChapterUrl = "";
        if (parentItemType === 'theis' && parentItem.getField('url') && parentItem.getField('url').include('cnki')) {
            var itemUrl  = parentItem.getField('url');
        } else {
            var fileData = Zotero.Jasminum.splitFilename(item.getFilename());
            var searchPrepareout = await Zotero.Jasminum.searchPrepare(fileData);
            var targetRow = await Zotero.Jasminum.search(
                searchPrepareout,
                fileData
            );
            // 获取文献链接URL -> 获取章节目录URL
        }
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url);
        xhr.onload = function() {
            if (this.status === 200) {
                var parser = new DOMParser();
                var html = parser.parseFromString(xhr.response, "text/html");
                var tree = html.getElementById('treeDiv');
                var rows = tree.querySelectorAll('tr');
                var rows_array = [];
                for(let row of rows) {
                    var cols = row.querySelectorAll('td');
                    var level = cols.length - 1;
                    var title = row.textContent.trim();
                    var onclickText = cols[cols.length-1].querySelector('a').onclick.toString();
                    var pageRex = onclickText.match(/CDMDNodeClick\('(\d+)'/);
                    var page = pageRex[1];
                    var bookmark = `BookmarkBegin\nBookmarkTitle: ${title}\nBookmarkLevel: ${level}\nBookmarkPageNumber: ${page}`;
                    rows_array.push(bookmark);
                }
            var bookmarks = rows_array.join('\n');
            }
        }
    },
};




var items = Zotero.getActiveZoteroPane().getSelectedItems();
Zotero.Jasminum.updateItems(items);
