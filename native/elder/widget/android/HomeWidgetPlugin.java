package com.grannytools.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HomeWidget")
public class HomeWidgetPlugin extends Plugin {
    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", Build.VERSION.SDK_INT >= 26 &&
            AppWidgetManager.getInstance(getContext()).isRequestPinAppWidgetSupported());
        call.resolve(result);
    }

    @PluginMethod
    public void requestPin(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
            boolean requested = Build.VERSION.SDK_INT >= 26 && manager.isRequestPinAppWidgetSupported()
                && manager.requestPinAppWidget(new ComponentName(getContext(), GrannytoolsWidget.class), null, null);
            JSObject result = new JSObject();
            // A request is not confirmation that the user added the widget.
            result.put("requested", requested);
            call.resolve(result);
        });
    }
}