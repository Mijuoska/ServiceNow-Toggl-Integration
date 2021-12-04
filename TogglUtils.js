var TogglUtils = Class.create();
TogglUtils.prototype = {
    initialize: function() {
        this.account = new GlideRecord('u_toggl_account');
        if (this.userHasAccount()) {
            this.account.get('sys_created_by', gs.getUserName());
            if (this.account.u_api_token) {
                this.API_TOKEN = this.account.u_api_token;
            }
        }

        this.logger = new GSLog('sn_toggl.log.level', 'TogglUtils');

    },
	

    userHasAccount: function() {
        var account = new GlideRecord('u_toggl_account');
        return account.get('sys_created_by', gs.getUserName());
    },

    userHasActiveAccount: function() {
        return (JSUtil.notNil(this.userHasAccount()) && JSUtil.notNil(this.API_TOKEN));
    },

    dataSyncEnabled: function() {
        return this.userHasActiveAcccount() && this.account.u_sync_data;
    },

    twoWaySyncEnabled: function() {
        return this.userHasActiveAcccount() && this.account.u_two_way_sync;
    },

    timeEntrySyncEnabled: function() {
        return this.userHasActiveAcccount() && this.account.u_sync_time_entries;
    },
	
	/**
	*   Fetch API token for a Toggl account matching the given credentials
	**/ 

    connectToToggl: function(username, password) {
        var decrypted = new GlideEncrypter().decrypt(password);
        var authString = username + ":" + decrypted;
        var encoded = GlideStringUtil.base64Encode(authString);
        var r = new sn_ws.RESTMessageV2('Toggl Users', 'Get User');
        r.setRequestHeader('Authorization', 'Basic ' + encoded);
        try {
            var response = r.execute();
            var result = this._handleResponse(response);
            return result;
        } catch (ex) {
            this._handleErrors('Something went wrong while connecting to Toggl', ex);
        }
    },


    syncWorkspaces: function() {
        var r = new sn_ws.RESTMessageV2('Toggl Workspaces', 'Default GET');
        r.setRequestHeader('Authorization', this._setAuthHeader());
        try {
            var response = r.execute();
            var workspaces = this._handleResponse(response);
            var ws = new GlideRecord('u_toggl_workspaces');
            var workspaceArr = [];

            ws.initialize();
            for (var w in workspaces) {
                if (ws.get('u_id', workspaces[w].id)) {
                    ws.get('u_id', workspaces[w].id);
                }
                ws.u_account = this.account.getUniqueValue();
                ws.u_id = workspaces[w].id;
                ws.u_name = workspaces[w].name;
                if (JSUtil.notNil(ws.sys_id)) {
                    ws.update();
                } else {
                    ws.insert();
                }


            }
            gs.addInfoMessage('Successfully synced Toggl workspace ' + workspaces[w].id);
            gs.info('Successfully synced Toggl workspace ' + workspaces[w].id);
            workspaceArr.push(workspaces[w].id.toString());
        } catch (ex) {
            this._handleErrors('Something went wrong while connecting to Toggl', ex);
        }

        return workspaceArr;
    },

    getWorkspaceIDs: function() {
        var ws = new GlideRecord('u_toggl_workspaces');
        var wsArr = [];
        ws.addQuery('sys_created_by', gs.getUserName());
        ws.query();
        while (ws.next()) {
            wsArr.push(ws.u_id.toString());
        }
        return wsArr;
    },

	

    syncClients: function(wid) {
        var clients = new GlideRecord('u_toggl_clients');
        var r = new sn_ws.RESTMessageV2('Toggl Workspaces', 'Get Workspace Clients');
        r.setStringParameter('wid', wid);
        r.setRequestHeader('Authorization', this._setAuthHeader());
        try {
            var response = r.execute();
            var clientData = this._handleResponse(response);
            for (var c in clientData) {
                if (clients.get('u_id', clientData[c].id)) {
                    clients.get('u_id', clientData[c].id);
                }
                clients.u_name = clientData[c].name;
                clients.u_id = clientData[c].id;
                clients.u_wid = wid;
                clients.u_workspace = this._getSysIDForRefID(wid, 'u_toggl_workspaces');
                if (JSUtil.nil(clients.sys_id)) {
                    clients.insert();
                } else {
                    clients.update();
                }
            }

            var successMessage = 'Successfully synced ' + clientData.length + ' clients for Toggl workspace ' + wid;
            gs.addInfoMessage(successMessage);
            gs.info(successMessage);
        } catch (ex) {
            this._handleErors('An error occurred with syncing Toggl clients', ex);
        }

    },



    syncProjects: function(wid) {
        var r = new sn_ws.RESTMessageV2('Toggl Workspaces', 'Get Workspace Projects');
        r.setStringParameter('wid', wid);
        r.setRequestHeader('Authorization', this._setAuthHeader());
        try {
            var response = r.execute();
            var projectData = this._handleResponse(response);
            var projects = new GlideRecord('u_toggl_projects');
            for (var p in projectData) {
                if (projects.get('u_id', projectData[p].id)) {
                    projects.get('u_id', projectData[p].id);
                }
                projects.u_id = projectData[p].id;
                projects.u_name = projectData[p].name;
                projects.u_cid = projectData[p].cid;
                projects.u_client = this._getSysIDForRefID(projects.u_cid, 'u_toggl_clients');
                projects.u_active = projectData[p].active;
                projects.u_wid = wid;
                projects.u_workspace = this._getSysIDForRefID(wid, 'u_toggl_workspaces');
                if (JSUtil.nil(projects.sys_id)) {
                    projects.insert();
                } else {
                    projects.update();
                }
            }
            var successMessage = 'Successfully synced ' + projectData.length + ' projects for Toggl workspace ' + wid;

            gs.addInfoMessage(successMessage);
            gs.info(successMessage);

        } catch (ex) {
            this._handleErrors('An error occurred with syncing Toggl projects', ex);
        }
    },

	/**
	* Syncs changes to a Toggl resource (Client, Project) from ServiceNow to Toggl.
	@param ObjectGR {GlideRecord} Toggl object record
	@param operation {String} The name of the operation (Create, Update, Delete);
	**/
	
    syncTogglObject: function(objectGR, operation) {
        var objectName = this._getObjectName(objectGR);
        var r = new sn_ws.RESTMessageV2('Toggl ' + objectName + 's', operation + ' ' + objectName);
        if (operation == 'Create' || operation == 'Update') {
            var body = {};
            var details = {
                'name': objectGR.u_name + "",
                'wid': objectGR.u_wid + ""
            };

            if (objectName == 'Project' && JSUtil.notNil(objectGR.u_cid)) {
                details['cid'] = objectGR.u_cid + "";
            }

            body[objectName.toLowerCase()] = details;
            body = JSON.stringify(body);
            r.setRequestBody(body);

        }

        if (operation == 'Update' || operation == 'Delete') {
            if (this._checkIfObjectExists(objectGR)) {
                r.setStringParameter('id', objectGR.u_id + "");
            } else {
                gs.info('The resource ' + objectGR.u_name + ' does not exist in Toggl');
                return;
            }
        }
        r.setRequestHeader('Authorization', this._setAuthHeader());
        try {
            var response = r.execute();
            gs.addInfoMessage(operation + 'd ' + objectName + ' ' + objectGR.u_name + ' in Toggl');
            return this._handleResponse(response);
        } catch (ex) {
            this._handleErrors('Something went wrong operation ' + operation + ' ' + objectName, ex);

        }

    },
	
	/**
	* Creates a Toggl resource (Client, Project) in Toggl from ServiceNow if it doesn't exist
	**/

    createObjectIfDoesNotExist: function(tableName) {
        var objectGR = new GlideRecord(tableName);
        objectGR.query();
        while (objectGR.next()) {
            if (!this._checkIfObjectExists(objectGR)) {
                this.syncTogglObject(objectGR, 'Create');
            }
        }
    },

    _getObjectName: function(objectGR) {
        var objectName;
        if (objectGR.getTableName().indexOf('clients') > -1) {
            objectName = 'Client';
        } else if (objectGR.getTableName().indexOf('projects') > -1) {
            objectName = 'Project';
        }
        return objectName;
    },

    _checkIfObjectExists: function(objectGR) {
        var objectName = this._getObjectName(objectGR);
        var r = new sn_ws.RESTMessageV2('Toggl ' + objectName + 's', 'Get ' + objectName + ' Details');
        r.setRequestHeader('Authorization', this._setAuthHeader());
        r.setStringParameter('id', objectGR.u_id + "");
        try {
            var response = r.execute();
            var status = response.getStatusCode();
            if (status == '200') {
                return true;
            } else if (status == '404') {
                return false;
            } else {
                gs.error('Fetching Toggl ' + objectName + ' failed with status code ' + status);
            }
        } catch (ex) {
            this._handleErrors('Something went wrong with connecting to Toggl', ex);
        }
    },

	

    syncTimeEntries: function(startdate, enddate) {
        var r = new sn_ws.RESTMessageV2('Toggl Time Entries', 'Get Entries');
        r.setRequestHeader('Authorization', this._setAuthHeader());
        if (startdate) {
            r.setQueryParameter('start_date', this._convertToISODate(startdate));
        }
        if (enddate) {
            r.setQueryParameter('end_date', this._convertToISODate(enddate));
        }
        try {
            var response = r.execute();
            var entries = this._handleResponse(response);
            var timeEntry = new GlideRecord('u_time_entries');
            for (var e in entries) {
                if (timeEntry.get('u_id', entries[e].id)) {
                    timeEntry.get('u_id', entries[e].id);
                }
                timeEntry.u_description = entries[e].description + '';
                timeEntry.u_id = entries[e].id + '';
                timeEntry.u_wid = entries[e].wid + '';
                timeEntry.u_pid = entries[e].pid + '';
                timeEntry.u_start = this._convertToGlideDate(entries[e].start);
                timeEntry.u_stop = this._convertToGlideDate(entries[e].stop);
                if (JSUtil.notNil(timeEntry.u_stop)) {
                    timeEntry.u_active = false;
                }
                timeEntry.u_duration = new GlideDuration(entries[e].duration * 1000);
                timeEntry.u_project = this._getSysIDForRefID(timeEntry.u_pid, 'u_toggl_projects');
                if (JSUtil.nil(timeEntry.sys_id)) {
                    timeEntry.insert();
                } else {
                    timeEntry.update();
                }


            }
            var successMessage = 'Successfully synced ' + entries.length + ' time entries';
            gs.addInfoMessage(successMessage);
            gs.info(successMessage);

        } catch (ex) {
            this._handleErrors('An error occurred with syncing entries', ex);
        }

    },


    startTimer: function(gr, description, projectGR) {
        if (this.timerIsRunningForTask(gr)) {
            gs.addErrorMessage('There is an already running time entry for this task');
            return;
        }
        var body = {};
        body['time_entry'] = {};
        var fields = gs.getProperty('sn_toggl.default.time.entry.description').split(',');
        if (JSUtil.nil(description) && new TableUtils(gr.getTableName()).getAbsoluteBase() == 'task') {
            description = "";
            fields.forEach(function(field) {
                description += gr[field] + " ";
            });
        }
        body.time_entry['description'] = description;
        body.time_entry['pid'] = JSUtil.notNil(projectGR.u_id) ? projectGR.u_id + "" : "";
        body.time_entry['created_with'] = 'ServiceNow';

        var r = new sn_ws.RESTMessageV2('Toggl Time Entries', 'Start Timer');
        r.setRequestHeader('Authorization', this._setAuthHeader());
        r.setRequestBody(JSON.stringify(body));
        try {
            var response = r.executeAsync();
            var result = this._handleResponse(response);
            if (!result['error']) {
                this.createTimeEntry(gr, result);
                return result;
            } else {
                gs.addErrorMessage('Something went wrong with starting the timer');
            }
        } catch (ex) {
            this._handleErrors('Something went wrong with starting the timer', ex);
        }

    },

    stopTimer: function(entryGR) {
        var r = new sn_ws.RESTMessageV2('Toggl Time Entries', 'Stop Timer');
        r.setStringParameter('id', entryGR.u_id + "");
        r.setRequestHeader('Authorization', this._setAuthHeader());
        try {
            var response = r.execute();
            var result = this._handleResponse(response);

            if (result) {
                gs.addInfoMessage('Timer stopped');
                return result;
            }
        } catch (ex) {
            this._handleErrors('Something went wrong with stopping the timer', ex);
        }


    },

    pollTimer: function(entryGR) {
        var r = new sn_ws.RESTMessageV2('Toggl Time Entries', 'Get Entry');
        r.setStringParameter('id', entryGR.u_id + "");
        r.setRequestHeader('Authorization', this._setAuthHeader());
        try {
            var response = r.executeAsync();
            var result = this._handleResponse(response);

            return result;
        } catch (ex) {
            this._handleErrors('Something went wrong with polling the timer', ex);
        }
    },

    createTimeEntry: function(gr, result) {
        var timeEntry = new GlideRecord('u_time_entries');
        timeEntry.initialize();
        timeEntry.u_id = result.data.id + '';
        timeEntry.u_description = result.data.description + '';
        timeEntry.u_wid = result.data.wid + '';
        timeEntry.u_pid = result.data.pid + '';
        timeEntry.u_project = this._getSysIDForRefID(timeEntry.u_pid, 'u_toggl_projects');
        timeEntry.u_start = this._convertToGlideDate(result.data.start);
        timeEntry.u_active = true;
        timeEntry.u_task = gr.getUniqueValue();
        timeEntry.insert();
        gs.addInfoMessage('Timer started');
    },

    updateTimeEntry: function(entry, result) {
        entry.u_stop = this._convertToGlideDate(result.data.stop);
        var ms = Number(result.data.duration) * 1000;
        var gdur = new GlideDuration(ms);
        entry.u_duration = gdur;
        entry.u_active = false;
        entry.update();
        gs.info("Synced Time Entry " + entry.u_id);
    },

    updateTimeEntryForTask: function(task, result) {
        var timeEntry = this.getActiveTimeEntryForTask(task);
        this.updateTimeEntry(timeEntry, result);
    },


    getActiveTimeEntryForTask: function(gr) {
        var timeEntry = new GlideRecord('u_time_entries');
        timeEntry.addQuery('u_task', gr.sys_id);
        timeEntry.addQuery('u_active', true);
        timeEntry.query();
        if (timeEntry.next()) {
            return timeEntry;
        }
    },

    userHasActiveEntryForTask: function(task) {
        var entry = this.getActiveTimeEntryForTask(task);
        return entry.sys_created_by == gs.getUserName();
    },

    getActiveEntriesForUser: function() {
        var timeEntry = new GlideRecord('u_time_entries');
        timeEntry.addQuery('u_active', true);
        timeEntry.addQuery('sys_created_by', gs.getUserName());
        timeEntry.query();
        return timeEntry;
    },

    userHasActiveEntries: function() {
        var entries = this.getActiveEntriesForUser();
        return entries.next();

    },

    inActivateOrDeleteEntry: function(entryGR, responseBody) {
        if (JSUtil.notNil(responseBody)) {
            if (JSUtil.notNil(responseBody.data.stop)) {
                this.updateTimeEntry(entryGR, responseBody);
                gs.info('Inactivated time entry ' + entryGR.u_id);
                return "Inactivated";
            }
            if (responseBody['error'] == 404) {
                entryGR.deleteRecord();
                gs.info('Deleted time entry ' + entryGR.u_id);
                return "Deleted";

            }
        }
    },


    timerIsRunningForTask: function(task) {
        return JSUtil.notNil(this.getActiveTimeEntryForTask(task));

    },

    calculateTimeForTask: function(task) {
        var total = 0;
        var dur = new GlideAggregate('u_time_entries');
        dur.addAggregate('SUM', 'u_duration');
        dur.addQuery('u_task.sys_id', task.sys_id);
        dur.setGroup(false);
        dur.query();
        while (dur.next()) {
            total = dur.getAggregate('SUM', 'u_duration');
        }
        return new GlideDuration(total);
    },


    _getSysIDForRefID: function(refID, table) {
        var gr = new GlideRecord(table);
        if (JSUtil.notNil(refID)) {
            if (gr.get('u_id', refID.toString())) {
                return gr.getUniqueValue();
            } else {
                return null;
            }
        }
    },

    _setAuthHeader: function() {
        if (this.API_TOKEN) {
            var authString = this.API_TOKEN + ":api_token";
            var encodedAuth = GlideStringUtil.base64Encode(authString);
            var encodedHeader = 'Basic ' + encodedAuth;
            return encodedHeader;
        } else {
            gs.addErrorMessage('No account activated or missing API token');
        }
    },

    _handleResponse: function(response) {
        var statusCode = response.getStatusCode();
        var body = response.getBody();
        if (body && statusCode == '200') {
            return JSON.parse(body);
        } else {
            var message = 'Error connecting to Toggl. Status code: ' + statusCode + ', response body: ' + body;
            this._handleErrors(message);
        }

    },

    _handleErrors: function(message, exception) {
        var logOutput = exception ? message + ': ' + exception : message;
        this.logger.logErr(logOutput);
        gs.addErrorMessage(message);
    },

    _convertToGlideDate: function(date) {
        var datetime = date.replace(/T/, " ");
        datetime = datetime.replace(/Z/, "");
        var result = new GlideCalendarDateTime(datetime);
        return result;
    },

    _convertToISODate: function(gdt) {
        var ms = gdt.getNumericValue();
        return new Date(ms).toISOString();
    },



    type: 'TogglUtils'
};
