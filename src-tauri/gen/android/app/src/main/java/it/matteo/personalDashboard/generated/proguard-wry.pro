# THIS FILE IS AUTO-GENERATED. DO NOT MODIFY!!

# Copyright 2020-2023 Tauri Programme within The Commons Conservancy
# SPDX-License-Identifier: Apache-2.0
# SPDX-License-Identifier: MIT

-keep class it.matteo.personalDashboard.* {
  native <methods>;
}

-keep class it.matteo.personalDashboard.WryActivity {
  public <init>(...);

  void setWebView(it.matteo.personalDashboard.RustWebView);
  java.lang.Class getAppClass(...);
  int getId();
  java.lang.String getVersion();
  int startActivity(...);
}

-keep class it.matteo.personalDashboard.Ipc {
  public <init>(...);

  @android.webkit.JavascriptInterface public <methods>;
}

-keep class it.matteo.personalDashboard.RustWebView {
  public <init>(...);

  void loadUrlMainThread(...);
  void loadHTMLMainThread(...);
  void evalScript(...);
}

-keep class it.matteo.personalDashboard.RustWebChromeClient,it.matteo.personalDashboard.RustWebViewClient {
  public <init>(...);
}
