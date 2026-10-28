package astra;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.os.Looper;

import java.io.File;
import java.io.FileOutputStream;

public final class Icons {
    public static void main(String[] args) throws Exception {
        Looper.prepareMainLooper();
        Class<?> at = Class.forName("android.app.ActivityThread");
        Object thread = at.getMethod("systemMain").invoke(null);
        Context ctx = (Context) at.getMethod("getSystemContext").invoke(thread);
        PackageManager pm = ctx.getPackageManager();
        File dir = new File(args[0]);
        dir.mkdirs();
        int size = 96;
        StringBuilder sb = new StringBuilder();
        for (ApplicationInfo ai : pm.getInstalledApplications(0)) {
            if (pm.getLaunchIntentForPackage(ai.packageName) == null) continue;
            String label = String.valueOf(ai.loadLabel(pm)).replace('\t', ' ').replace('\n', ' ').trim();
            boolean sys = (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
            File f = new File(dir, ai.packageName + ".png");
            if (!f.exists()) {
                try {
                    Drawable d = ai.loadIcon(pm);
                    Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
                    Canvas c = new Canvas(b);
                    d.setBounds(0, 0, size, size);
                    d.draw(c);
                    File tmp = new File(dir, ai.packageName + ".tmp");
                    try (FileOutputStream o = new FileOutputStream(tmp)) {
                        b.compress(Bitmap.CompressFormat.PNG, 100, o);
                    }
                    b.recycle();
                    tmp.renameTo(f);
                } catch (Throwable ignored) {
                }
            }
            sb.append(ai.packageName).append('\t').append(label).append('\t').append(sys ? 1 : 0).append('\n');
        }
        System.out.print(sb);
        System.out.flush();
        System.exit(0);
    }
}
