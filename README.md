# ServiceNow-Toggl-Integration

This is a ServiceNow integration for the popular time tracking tool Toggl (now called Toggl Track). You can sync your projects and clients and time entries with ServiceNow as well as create a time entry from any Task record. 

I have been using Toggl to track time spent on incidents and service requests for billing and reporting purposes, and wanted to have an easy way to start the time tracker from within ServiceNow. This project was born out of that need.

After installing the update, you need to do the following to enable the integration:
<ul>
  
<li>If you don't have one, you can get a free Toggl account at https://track.toggl.com/. </li>
<li>Navigate to the Toggl Accounts module in ServiceNow</li>
<li>Create a new Toggl account record and enter your credentials. Save the form.</li>
<li>Click on the Connect form link. This retrieves your API token from Toggl</li>
<li>Select which of your data you want to sync under Sync Options on the Toggl Account record</li>
<li>Click on the Sync UI action</li>
<li>You can then start tracking your time with the help of the Start Timer / Stop Timer UI actions on any Task record.</li>
