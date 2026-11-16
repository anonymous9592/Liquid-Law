package com.stuthilabs.casecanvas;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CaseFilesPlugin.class);          // before super.onCreate: the bridge loads plugins there
        super.onCreate(savedInstanceState);
    }

    /** A .lawcase opened from Files / Drive while the app is already running (launchMode singleTask). */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        PluginHandle h = getBridge() != null ? getBridge().getPlugin("CaseFiles") : null;
        if (h != null && h.getInstance() instanceof CaseFilesPlugin) ((CaseFilesPlugin) h.getInstance()).handleViewIntent(intent);
    }
}
