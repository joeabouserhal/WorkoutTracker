package com.workouttracker

import android.app.Application
import com.facebook.react.common.assets.ReactFontManager
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    registerInterFonts()
    loadReactNative(this)
  }

  private fun registerInterFonts() {
    val fontManager = ReactFontManager.getInstance()
    fontManager.addCustomFont(this, "InterTight_300Light", R.font.inter_tight_300_light)
    fontManager.addCustomFont(this, "InterTight_400Regular", R.font.inter_tight_400_regular)
    fontManager.addCustomFont(this, "InterTight_500Medium", R.font.inter_tight_500_medium)
    fontManager.addCustomFont(this, "InterTight_600SemiBold", R.font.inter_tight_600_semibold)
    fontManager.addCustomFont(this, "InterTight_700Bold", R.font.inter_tight_700_bold)
    fontManager.addCustomFont(this, "InterTight_800ExtraBold", R.font.inter_tight_800_extrabold)
    fontManager.addCustomFont(this, "InterTight_900Black", R.font.inter_tight_900_black)
  }
}
