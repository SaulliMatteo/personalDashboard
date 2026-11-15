plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "it.matteo.usagestats"
    compileSdk = 36

    defaultConfig {
        // Come l'app (gen/android/app/build.gradle.kts).
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
}

dependencies {
    // Solo l'API dei plugin di Tauri: UsageStatsManager e AppOpsManager sono dell'SDK di Android.
    implementation(project(":tauri-android"))
}
