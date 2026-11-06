plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "it.matteo.fileopen"
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
    implementation(project(":tauri-android"))
    // FileProvider. Stessa versione che usa già l'API dei plugin di Tauri: nell'APK non entra niente di nuovo.
    implementation("androidx.core:core-ktx:1.7.0")
}
